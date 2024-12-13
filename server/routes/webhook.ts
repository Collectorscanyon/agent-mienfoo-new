import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import { config } from '../config/environment';

const router = Router();

// Initialize API clients with proper v2 SDK configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    }
  }
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// Verify webhook signature
function verifySignature(signature: string, body: string): boolean {
  const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

// Enhanced request logging middleware with structured logging
router.use((req: Request, res: Response, next) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();
  
  // Log full request details for debugging
  console.log('Webhook request received:', {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
      'user-agent': req.headers['user-agent']
    },
    body: req.method === 'POST' ? {
      type: req.body?.type,
      data: req.body?.data ? {
        hash: req.body.data.hash,
        text: req.body.data.text,
        author: req.body.data.author ? {
          username: req.body.data.author.username,
          fid: req.body.data.author.fid
        } : null,
        mentioned_profiles: req.body.data.mentioned_profiles
      } : null
    } : undefined
  });

  // Add response tracking
  const oldSend = res.send;
  res.send = function(data) {
    console.log('Webhook response:', {
      requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      body: data
    });
    return oldSend.apply(res, arguments as any);
  };

  next();
});


// Main webhook endpoint
router.post('/', express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}), async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();
  
  console.log('Processing webhook:', {
    requestId,
    timestamp,
    type: req.body?.type,
    data: req.body?.data ? {
      hash: req.body.data.hash,
      text: req.body.data.text,
      author: req.body.data.author?.username,
      mentioned_profiles: req.body.data.mentioned_profiles?.map((p: any) => ({
        username: p.username,
        fid: p.fid
      }))
    } : null
  });

  try {
    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-neynar-signature'] as string;
      if (!signature || !verifySignature(signature, req.rawBody!)) {
        console.warn('Invalid webhook signature:', {
          requestId,
          timestamp,
          signature: signature ? `${signature.substring(0, 10)}...` : 'missing'
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body;

    // Only handle cast.created events
    if (type !== 'cast.created') {
      console.log('Ignoring non-cast event:', {
        requestId,
        timestamp,
        type
      });
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Check for bot mention
    const isBotMentioned = data.mentioned_profiles?.some((p: any) => 
      p.username === 'mienfoo.eth' || p.fid === '834885' || data.text?.toLowerCase().includes('@mienfoo.eth')
    );

    if (!isBotMentioned) {
      console.log('No bot mention detected:', {
        requestId,
        timestamp,
        text: data.text,
        mentioned_profiles: data.mentioned_profiles
      });
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    console.log('Processing bot mention:', {
      requestId,
      timestamp,
      text: data.text,
      author: data.author.username,
      hash: data.hash
    });

    // Generate response
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are Mienfoo, a knowledgeable Pokémon card collector bot.
Your responses should be:
- Concise (max 280 chars)
- Friendly and helpful
- Focused on Pokémon card collecting advice
- Always end with /collectorscanyon
- Include specific card knowledge when relevant`
        },
        { role: "user", content: data.text.replace(/@[\w.]+/g, '').trim() }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    let response = completion.choices[0]?.message?.content || "Processing your request. Please try again shortly. /collectorscanyon";

    // Ensure proper response formatting
    if (!response.endsWith('/collectorscanyon')) {
      response = `${response} /collectorscanyon`;
    }

    console.log('Generated response:', {
      requestId,
      timestamp,
      response,
      parentHash: data.hash
    });

    // Add like reaction
    try {
      await neynar.publishReaction({
        signerUuid: config.SIGNER_UUID!,
        reactionType: 'like',
        target: data.hash
      });
      console.log('Successfully liked cast:', {
        requestId,
        timestamp,
        hash: data.hash
      });
    } catch (error) {
      console.error('Error liking cast:', {
        requestId,
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue with reply even if like fails
    }

    // Post reply
    try {
      const replyText = `@${data.author.username} ${response}`;
      console.log('Posting reply:', {
        requestId,
        timestamp,
        text: replyText,
        parentHash: data.hash
      });

      const reply = await neynar.publishCast({
        signerUuid: config.SIGNER_UUID!,
        text: replyText,
        parent: data.hash,
        channelId: 'collectorscanyon'
      });

      console.log('Successfully posted reply:', {
        requestId,
        timestamp,
        replyHash: reply.cast.hash,
        parentHash: data.hash,
        text: replyText.substring(0, 50) + '...'
      });

      return res.status(200).json({ 
        status: 'success',
        hash: reply.cast.hash
      });
    } catch (error) {
      console.error('Error posting reply:', {
        requestId,
        timestamp,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error),
        parentHash: data.hash
      });
      throw error;
    }
  } catch (error) {
    console.error('Webhook handler error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? 
          error instanceof Error ? error.message : String(error) : 
          undefined
      });
    }
  }
});

export default router;
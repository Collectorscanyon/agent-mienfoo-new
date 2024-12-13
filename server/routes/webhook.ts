import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/environment';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';

const router = Router();

// Initialize API clients
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

// Track processed mentions to prevent duplicates
const processedMentions = new Set<string>();

// Enhanced request logging middleware
router.use((req: Request, res: Response, next) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  console.log('Debug: Incoming webhook request:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    },
    body: req.method === 'POST' ? JSON.stringify(req.body, null, 2) : undefined
  });

  // Track response
  const oldSend = res.send;
  res.send = function(data) {
    console.log('Debug: Outgoing response:', {
      requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      body: data
    });
    return oldSend.apply(res, arguments as any);
  };

  next();
});

// Verify webhook signature
function verifySignature(signature: string | undefined, body: string): boolean {
  if (!signature || !config.WEBHOOK_SECRET) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
    const calculatedSignature = hmac.update(body).digest('hex');
    return signature === calculatedSignature;
  } catch (error) {
    console.error('Debug: Signature verification error:', error);
    return false;
  }
}

// Main webhook endpoint
router.post('/', express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  },
  limit: '50kb'
}), async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  try {
    console.log('Debug: Processing webhook:', {
      requestId,
      timestamp: new Date().toISOString(),
      type: req.body?.type,
      data: {
        hash: req.body?.data?.hash,
        text: req.body?.data?.text,
        author: req.body?.data?.author?.username,
        mentionedProfiles: req.body?.data?.mentioned_profiles
      }
    });

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-neynar-signature'] as string;
      if (!signature || !verifySignature(signature, req.rawBody!)) {
        console.error('Debug: Invalid signature:', {
          requestId,
          timestamp: new Date().toISOString()
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body;
    
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Skip if already processed
    if (processedMentions.has(data.hash)) {
      console.log('Debug: Skipping duplicate mention:', {
        requestId,
        hash: data.hash
      });
      return res.status(200).json({ status: 'ignored', reason: 'already processed' });
    }

    // Check for bot mention with enhanced logging
    const isBotMentioned = data.mentioned_profiles?.some(
      (profile: any) => 
        profile.username.toLowerCase() === 'mienfoo.eth' ||
        profile.fid === '834885'
    );

    console.log('Debug: Bot mention check:', {
      requestId,
      text: data.text,
      mentioned_profiles: data.mentioned_profiles,
      isBotMentioned,
      botUsername: config.BOT_USERNAME
    });

    if (!isBotMentioned) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    // Process mention and generate response
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are Mienfoo, a knowledgeable Pokémon card collector bot. 
Keep responses concise (max 280 chars), friendly, and focused on collecting advice. 
Always end your responses with /collectorscanyon`
          },
          { role: "user", content: data.text }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      let response = completion.choices[0].message.content;
      if (!response?.endsWith('/collectorscanyon')) {
        response = `${response} /collectorscanyon`;
      }

      console.log('Debug: Generated response:', {
        requestId,
        response
      });

      // Post the response
      await neynar.publishCast({
        signerUuid: config.SIGNER_UUID!,
        text: `@${data.author.username} ${response}`,
        parent: data.hash,
        channelId: 'collectorscanyon'
      });

      // Mark as processed
      processedMentions.add(data.hash);

      // Clean up old mentions after 10 minutes
      setTimeout(() => processedMentions.delete(data.hash), 10 * 60 * 1000);

      console.log('Debug: Successfully processed mention:', {
        requestId,
        hash: data.hash,
        response
      });

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Debug: Error processing mention:', {
        requestId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        hash: data.hash
      });
      throw error;
    }
  } catch (error) {
    console.error('Debug: Webhook error:', {
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

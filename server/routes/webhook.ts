import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/environment';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';

interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

const router = Router();

const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY!,
  signerUuid: config.SIGNER_UUID
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// Track processed mentions
const processedMentions = new Set<string>();

// Verify webhook signature
function verifySignature(signature: string | undefined, body: Buffer): boolean {
  console.log('Debug: Verifying signature:', {
    timestamp: new Date().toISOString(),
    hasSignature: !!signature,
    hasWebhookSecret: !!config.WEBHOOK_SECRET,
    bodyLength: body?.length,
    environment: process.env.NODE_ENV
  });

  // Skip verification in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Debug: Skipping signature verification in development/testing');
    return true;
  }

  if (!signature || !config.WEBHOOK_SECRET || !body) {
    console.log('Debug: Missing required verification components:', {
      hasSignature: !!signature,
      hasSecret: !!config.WEBHOOK_SECRET,
      hasBody: !!body
    });
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
    const calculatedSignature = `sha256=${hmac.update(body).digest('hex')}`;
    
    console.log('Debug: Signature comparison:', {
      received: signature.slice(0, 20) + '...',
      calculated: calculatedSignature.slice(0, 20) + '...'
    });
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  } catch (error) {
    console.error('Debug: Signature verification error:', error);
    return false;
  }
}

// Webhook endpoint
router.post('/', express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  },
  limit: '50kb'
}), async (req: WebhookRequest, res: Response) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  try {
    // Log full request details
    console.log('Debug: Incoming webhook request:', {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing',
        'user-agent': req.headers['user-agent']
      },
      body: JSON.stringify(req.body, null, 2)
    });

    // Skip signature verification in development
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-neynar-signature'] as string;
      if (!verifySignature(signature, req.rawBody!)) {
        console.error('Debug: Invalid signature:', {
          requestId,
          timestamp: new Date().toISOString()
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body;
    
    console.log('Debug: Processing webhook:', {
      requestId,
      type,
      data: {
        hash: data?.hash,
        text: data?.text,
        author: data?.author?.username,
        mentionedProfiles: data?.mentioned_profiles
      }
    });

    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    const { hash, text, mentioned_profiles } = data;

    // Skip if already processed
    if (processedMentions.has(hash)) {
      console.log('Debug: Skipping duplicate mention:', {
        requestId,
        hash
      });
      return res.status(200).json({ status: 'ignored', reason: 'already processed' });
    }

    // Check for bot mention
    console.log('Debug: Checking bot mention:', {
      requestId,
      mentioned_profiles,
      botUsername: config.BOT_USERNAME || 'mienfoo.eth',
      text
    });

    const isBotMentioned = mentioned_profiles?.some(
      (profile: any) => profile.username.toLowerCase() === (config.BOT_USERNAME || 'mienfoo.eth').toLowerCase()
    );

    if (!isBotMentioned) {
      console.log('Debug: Bot not mentioned:', {
        requestId,
        text,
        mentioned_profiles: mentioned_profiles?.map((p: any) => p.username)
      });
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    console.log('Debug: Bot mention confirmed:', {
      requestId,
      text
    });

    // Generate response
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content: `You are Mienfoo, a knowledgeable Pokémon card collector bot. 
Keep responses concise (max 280 chars), friendly, and focused on collecting advice. 
Always end your responses with /collectorscanyon`
        },
        { role: "user", content: text }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    let response = completion.choices[0].message.content;
    if (!response?.endsWith('/collectorscanyon')) {
      response = `${response} /collectorscanyon`;
    }

    console.log('Debug: Posting response:', {
      requestId,
      response,
      parentHash: hash
    });

    // Post response
    await neynar.publishCast({
      signerUuid: config.SIGNER_UUID!,
      text: response,
      replyTo: hash
    });

    // Mark as processed
    processedMentions.add(hash);

    console.log('Debug: Response posted successfully:', {
      requestId,
      hash,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Debug: Error processing webhook:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
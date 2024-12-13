import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import crypto from 'crypto';

// Initialize API clients with proper error handling
const neynarConfig = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    }
  }
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000
});

// Enhanced logging for initialization
console.log('API clients initialized:', {
  timestamp: new Date().toISOString(),
  hasNeynarKey: !!process.env.NEYNAR_API_KEY,
  hasOpenAIKey: !!process.env.OPENAI_API_KEY,
  hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
  environment: process.env.NODE_ENV
});

// Verify webhook signature
function verifySignature(signature: string, body: string): boolean {
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET!);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

// Webhook handler with enhanced error handling and logging
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();

  // Enhanced request logging
  console.log('Webhook request received:', {
    requestId,
    timestamp,
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
    },
    body: req.body ? {
      type: req.body.type,
      data: req.body.data ? {
        hash: req.body.data.hash,
        text: req.body.data.text?.substring(0, 50) + '...',
        author: req.body.data.author?.username
      } : null
    } : null
  });

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Neynar-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('Invalid method:', {
      requestId,
      timestamp,
      method: req.method
    });
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify signature
    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature || !verifySignature(signature, JSON.stringify(req.body))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Check for bot mention
    const isBotMentioned = data.mentioned_profiles?.some((p: any) => 
      p.username === process.env.BOT_USERNAME || 
      p.fid === process.env.BOT_FID || 
      data.text?.toLowerCase().includes(`@${process.env.BOT_USERNAME}`)
    );

    if (!isBotMentioned) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    // Generate response using OpenAI
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

    let response = completion.choices[0]?.message?.content || 
      "Processing your request. Please try again shortly. /collectorscanyon";

    // Ensure proper response formatting
    if (!response.endsWith('/collectorscanyon')) {
      response = `${response} /collectorscanyon`;
    }

    // Add like reaction and reply
    try {
      await neynar.publishReaction({
        signerUuid: process.env.SIGNER_UUID!,
        reactionType: 'like',
        target: data.hash
      });

      const replyText = `@${data.author.username} ${response}`;
      const reply = await neynar.publishCast({
        signerUuid: process.env.SIGNER_UUID!,
        text: replyText,
        parent: data.hash,
        channelId: 'collectorscanyon'
      });

      return res.status(200).json({ 
        status: 'success',
        hash: reply.cast.hash
      });
    } catch (error) {
      console.error('Error in like/reply:', error);
      throw error;
    }

  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? 
        error instanceof Error ? error.message : String(error) : 
        undefined
    });
  }
}
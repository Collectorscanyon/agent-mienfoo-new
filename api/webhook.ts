import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import crypto from 'crypto';

// Initialize API clients with enhanced configuration
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

// Verify webhook signature
function verifySignature(signature: string, body: string): boolean {
  if (!process.env.WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
// Test endpoint for webhook
export async function testWebhook(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testPayload = {
    type: 'cast.created',
    data: {
      hash: 'test456',
      text: 'Hey @mienfoo.eth, what makes a Pokemon card valuable?',
      author: {
        fid: '123456',
        username: 'test_user'
      },
      mentioned_profiles: [
        {
          fid: '834885',
          username: 'mienfoo.eth'
        }
      ]
    }
  };

  try {
    // Process the test payload
    await handler({ 
      method: 'POST', 
      body: testPayload,
      headers: {
        'x-neynar-signature': process.env.WEBHOOK_SECRET ? 
          crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
            .update(JSON.stringify(testPayload))
            .digest('hex') : 
          'test'
      }
    } as any, res);

    return res.status(200).json({ 
      status: 'success',
      message: 'Test webhook processed successfully'
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    return res.status(500).json({ 
      error: 'Test webhook failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
  const requestId = crypto.randomBytes(4).toString('hex');
  console.log('Webhook request received:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
    }
  });

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-neynar-signature'] as string;
      if (!signature || !verifySignature(signature, JSON.stringify(req.body))) {
        console.warn('Invalid webhook signature:', {
          requestId,
          signature: signature ? `${signature.substring(0, 10)}...` : 'missing'
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body;

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Check for bot mention
    const isBotMentioned = data.mentioned_profiles?.some((p: any) => 
      p.username === 'mienfoo.eth' || p.fid === '834885' || 
      data.text?.toLowerCase().includes('@mienfoo.eth')
    );

    if (!isBotMentioned) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

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

    let response = completion.choices[0]?.message?.content || 
      "Processing your request. Please try again shortly. /collectorscanyon";

    if (!response.endsWith('/collectorscanyon')) {
      response = `${response} /collectorscanyon`;
    }

    // Add like reaction
    try {
      await neynar.publishReaction({
        signerUuid: process.env.SIGNER_UUID!,
        reactionType: 'like',
        target: data.hash
      });
    } catch (error) {
      console.error('Error liking cast:', error);
      // Continue with reply even if like fails
    }

    // Post reply
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
    console.error('Webhook handler error:', {
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? 
        error instanceof Error ? error.message : String(error) : 
        undefined
    });
  }
}

import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
if (!process.env.NEYNAR_API_KEY || !process.env.SIGNER_UUID) {
  console.error('Missing required environment variables: NEYNAR_API_KEY and/or SIGNER_UUID');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client with proper configuration
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY || '',
  signer: { signer_uuid: process.env.SIGNER_UUID || '' }
});

// Log configuration status
console.log('Server configuration:', {
  hasNeynarKey: !!process.env.NEYNAR_API_KEY,
  hasSignerUuid: !!process.env.SIGNER_UUID,
  hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
  port: process.env.PORT || 5000
});

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Webhook signature verification
function verifyWebhookSignature(signature: string, body: string): boolean {
  try {
    if (!process.env.WEBHOOK_SECRET) {
      console.warn('WEBHOOK_SECRET not set, skipping signature verification');
      return true;
    }
    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const expectedSignature = hmac.update(body).digest('hex');
    return signature === expectedSignature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Webhook handler
app.post('/webhook', async (req, res) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`[${timestamp}][${requestId}] Received webhook`);
  console.log(`[${timestamp}][${requestId}] Headers:`, req.headers);
  console.log(`[${timestamp}][${requestId}] Body:`, req.body);
  
  try {
    // Always respond quickly to the webhook
    res.status(200).json({ status: 'received', requestId });
    
    // Process the webhook asynchronously
    const signature = req.headers['x-neynar-signature'] as string;
    const rawBody = JSON.stringify(req.body);
    
    if (!signature || !verifyWebhookSignature(signature, rawBody)) {
      console.warn(`[${timestamp}][${requestId}] Invalid webhook signature`);
      return;
    }

    const { type, cast } = req.body;
    console.log(`[${timestamp}][${requestId}] Processing webhook:`, {
      type,
      castText: cast?.text,
      author: cast?.author?.username
    });

    if (type === 'cast.created' && cast) {
      // Check for mentions using both FID and username
      const isBotMentioned = cast.mentions?.some((m: any) => 
        m.fid === process.env.BOT_FID || 
        m.username?.toLowerCase() === process.env.BOT_USERNAME?.toLowerCase()
      );

      if (isBotMentioned) {
        console.log(`[${timestamp}][${requestId}] Bot mention detected, processing...`);
        await handleMention(cast, requestId);
      }

      // Check if cast should be shared to collectors channel
      if (isCollectibleRelated(cast.text)) {
        await postToCollectorsCanyon(cast, requestId);
      }
    }

    console.log(`[${timestamp}][${requestId}] Webhook processed successfully`);
  } catch (error) {
    console.error(`[${timestamp}][${requestId}] Webhook Error:`, error);
    // We've already sent a 200 response, so just log the error
  }
});

async function handleMention(cast: any, requestId: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}][${requestId}] Processing mention from: ${cast.author.username}`);
  
  try {
    // Like the mention first
    try {
      await neynar.reactions.cast.like(process.env.SIGNER_UUID || '', cast.hash);
      console.log(`[${timestamp}][${requestId}] Successfully liked cast`);
    } catch (likeError) {
      console.error(`[${timestamp}][${requestId}] Error liking cast:`, likeError);
      // Continue with reply even if like fails
    }

    // Reply to mention
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles! #CollectorsCanyonClub`,
      replyTo: cast.hash,
      channelId: 'collectorscanyon'
    });
    console.log(`[${timestamp}][${requestId}] Successfully replied to mention`);

    // Share to collectors channel if not already in the channel
    if (!cast.parent_url?.includes('collectorscanyon')) {
      try {
        await neynar.publishCast({
          signerUuid: process.env.SIGNER_UUID || '',
          text: `Check out this discussion! ${cast.text}`,
          channelId: 'collectorscanyon'
        });
        console.log(`[${timestamp}][${requestId}] Successfully shared to collectors channel`);
      } catch (channelError) {
        console.error(`[${timestamp}][${requestId}] Error sharing to channel:`, channelError);
      }
    }
  } catch (error) {
    console.error(`[${timestamp}][${requestId}] Error handling mention:`, {
      error,
      cast: {
        hash: cast.hash,
        author: cast.author.username,
        text: cast.text
      }
    });
  }
}

async function postToCollectorsCanyon(cast: any, requestId: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}][${requestId}] Sharing cast to CollectorsCanyonClub`);
  
  try {
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `💡 Interesting collection discussion!\n\n${cast.text}\n\nVia @${cast.author.username}\n#CollectorsCanyonClub`,
      channelId: 'collectorscanyon'
    });
    console.log(`[${timestamp}][${requestId}] Successfully shared to CollectorsCanyon`);
  } catch (error) {
    console.error(`[${timestamp}][${requestId}] Error posting to channel:`, {
      error,
      cast: {
        author: cast.author.username,
        text: cast.text
      }
    });
  }
}

function isCollectibleRelated(text: string): boolean {
  const keywords = ['collect', 'card', 'rare', 'trading', 'pokemon', 'magic'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      botFid: process.env.BOT_FID
    }
  });
});

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Listening for mentions and channel posts');
});

import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Type definitions for webhook payloads
interface WebhookPayload {
  type: string;
  cast?: {
    hash: string;
    text: string;
    author: {
      username: string;
      fid: string;
    };
    mentions?: Array<{ fid: string }>;
  };
}

// Validate required environment variables
const requiredEnvVars = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET', 'BOT_FID'] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY || ''
});

// Webhook signature verification middleware
function verifySignature(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const signature = req.headers['x-neynar-signature'];
    if (!signature || typeof signature !== 'string') {
      console.error('Missing webhook signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET || '');
    const body = JSON.stringify(req.body);
    const digest = hmac.update(body).digest('hex');

    if (signature !== `sha256=${digest}`) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  } catch (error) {
    console.error('Signature verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Webhook endpoint
app.post('/webhook', verifySignature, async (req: express.Request, res: express.Response) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] Received webhook:`, req.body);

  try {
    // Send immediate acknowledgment
    res.status(200).json({ status: 'received', requestId });

    const payload = req.body as WebhookPayload;
    if (!payload.cast) {
      console.log(`[${requestId}] No cast in payload`);
      return;
    }

    // Process mentions
    const isBotMentioned = payload.cast.mentions?.some(m => m.fid === process.env.BOT_FID);
    if (isBotMentioned) {
      await handleMention(payload.cast, requestId);
    }

    // Check for collection-related content
    if (isCollectibleRelated(payload.cast.text)) {
      await shareToCollectorsCanyon(payload.cast, requestId);
    }
  } catch (error) {
    console.error(`[${requestId}] Error processing webhook:`, error);
  }
});

async function handleMention(cast: WebhookPayload['cast'], requestId: string) {
  if (!cast) return;
  console.log(`[${requestId}] Processing mention from: ${cast.author.username}`);

  try {
    // Like the mention
    await neynar.publishReaction({
      signerUuid: process.env.SIGNER_UUID || '',
      reactionType: 'like',
      target: cast.hash
    });

    // Reply to mention
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles! #CollectorsCanyonClub`,
      parent: cast.hash,
      channelId: 'collectorscanyon'
    });

    console.log(`[${requestId}] Successfully processed mention`);
  } catch (error) {
    console.error(`[${requestId}] Error handling mention:`, error);
  }
}

async function shareToCollectorsCanyon(cast: WebhookPayload['cast'], requestId: string) {
  if (!cast) return;
  console.log(`[${requestId}] Sharing to CollectorsCanyon`);

  try {
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `💡 Interesting collection discussion!\n\n${cast.text}\n\nVia @${cast.author.username}\n#CollectorsCanyonClub`,
      channelId: 'collectorscanyon'
    });

    console.log(`[${requestId}] Successfully shared to channel`);
  } catch (error) {
    console.error(`[${requestId}] Error sharing to channel:`, error);
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
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
      botFid: process.env.BOT_FID
    }
  });
});

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Ready for webhook requests');
}).on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

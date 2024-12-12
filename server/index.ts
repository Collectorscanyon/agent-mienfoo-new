import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET'] as const;
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

// Initialize Neynar client with v2 configuration
import { Configuration } from '@neynar/nodejs-sdk';

const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY || '',
  fid: parseInt(process.env.BOT_FID || '834885', 10)
});

const neynar = new NeynarAPIClient(config);

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
    const expectedSignature = `sha256=${digest}`;

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature', {
        received: signature,
        expected: expectedSignature
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  } catch (error) {
    console.error('Signature verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Webhook endpoint
app.post('/webhook', verifySignature, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${new Date().toISOString()}][${requestId}] Received webhook:`, req.body);

  try {
    // Send immediate acknowledgment
    res.status(200).json({ status: 'received', requestId });

    const { type, cast } = req.body;

    // Process mentions
    if (type === 'cast.created' && cast?.mentions?.some(m => m.fid === process.env.BOT_FID)) {
      await handleMention(cast, requestId);
    }

    // Check for collection-related content
    if (cast?.text && isCollectibleRelated(cast.text)) {
      await shareToCollectorsCanyon(cast, requestId);
    }
  } catch (error) {
    console.error(`[${requestId}] Error processing webhook:`, error);
    // No need to send error response since we already sent 200 OK
  }
});

async function handleMention(cast: any, requestId: string) {
  console.log(`[${requestId}] Processing mention from: ${cast.author.username}`);

  try {
    // Like the mention
    await neynar.publishReaction({
      signerUuid: process.env.SIGNER_UUID || '',
      reactionType: 'like',
      castHash: cast.hash
    });

    // Reply to mention
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles! #CollectorsCanyonClub`,
      parentCastId: cast.hash,
      channelId: 'collectorscanyon'
    });

    console.log(`[${requestId}] Successfully processed mention`);
  } catch (error) {
    console.error(`[${requestId}] Error handling mention:`, error);
  }
}

async function shareToCollectorsCanyon(cast: any, requestId: string) {
  console.log(`[${requestId}] Sharing to CollectorsCanyonClub`);

  try {
    await neynar.publishCast({
      signer_uuid: process.env.SIGNER_UUID || '',
      text: `💡 Interesting collection discussion!\n\n${cast.text}\n\nVia @${cast.author.username}\n#CollectorsCanyonClub`,
      parent_url: 'https://warpcast.com/~/channel/collectorscanyon'
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Ready for webhook requests');
}).on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
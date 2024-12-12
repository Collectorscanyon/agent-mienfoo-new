import express from 'express';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'BOT_FID', 'WEBHOOK_SECRET'] as const;
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Express and middleware
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client with proper configuration
const config = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY || '',
});

const neynar = new NeynarAPIClient(config);

// Request logging middleware
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] ${req.method} ${req.path}`);
  next();
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    // Verify signature
    const signature = req.headers['x-neynar-signature'];
    if (!signature || typeof signature !== 'string') {
      console.error(`[${requestId}] Missing webhook signature`);
      return res.status(401).json({ error: 'Missing signature' });
    }

    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (`sha256=${hmac}` !== signature) {
      console.error(`[${requestId}] Invalid webhook signature`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Log webhook receipt
    console.log(`[${requestId}] Received webhook:`, {
      type: req.body.type,
      cast: req.body.cast?.text,
      author: req.body.cast?.author?.username
    });

    // Send immediate response
    res.status(200).json({ status: 'received', requestId });

    // Process webhook asynchronously
    if (req.body.cast) {
      setImmediate(async () => {
        try {
          const { cast } = req.body;
          
          // Handle mentions
          if (cast.mentions?.some((m: any) => m.fid === process.env.BOT_FID)) {
            await handleMention(cast, requestId);
          }

          // Check for collection-related content
          if (isCollectibleRelated(cast.text)) {
            await shareToCollectorsCanyon(cast, requestId);
          }
        } catch (error) {
          console.error(`[${requestId}] Error processing webhook:`, error);
        }
      });
    }
  } catch (error) {
    console.error(`[${requestId}] Webhook error:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleMention(cast: any, requestId: string) {
  try {
    // Like the mention
    await neynar.publishReaction({
      signerUuid: process.env.SIGNER_UUID!,
      reactionType: 'like',
      target: cast.hash
    });
    console.log(`[${requestId}] Liked mention from @${cast.author.username}`);

    // Reply to mention
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID!,
      text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles! #CollectorsCanyonClub`,
      parent: cast.hash,
      channelId: 'collectorscanyon'
    });
    console.log(`[${requestId}] Replied to @${cast.author.username}`);
  } catch (error) {
    console.error(`[${requestId}] Error handling mention:`, error);
  }
}

async function shareToCollectorsCanyon(cast: any, requestId: string) {
  try {
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID!,
      text: `💡 Collection discussion!\n\n${cast.text}\n\nvia @${cast.author.username}\n#CollectorsCanyonClub`,
      channelId: 'collectorscanyon'
    });
    console.log(`[${requestId}] Shared to CollectorsCanyon`);
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

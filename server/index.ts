import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
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
const neynar = new NeynarAPIClient({ 
  apiKey: process.env.NEYNAR_API_KEY || '' 
});

// Type definitions for webhook payload
interface WebhookPayload {
  type: 'cast.created' | string;
  cast?: {
    hash: string;
    text: string;
    author: {
      fid: string;
      username: string;
    };
    mentions?: Array<{ fid: string }>;
    parent_hash?: string;
  };
}

// Request logging middleware
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[${requestId}] ${req.method} ${req.path}`);
  next();
});

// Webhook signature verification middleware
const verifyWebhookSignature = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const signature = req.headers['x-neynar-signature'];
  if (!signature || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Missing webhook signature' });
  }

  try {
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (`sha256=${hmac}` !== signature) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return res.status(500).json({ error: 'Error verifying webhook signature' });
  }
};

// Webhook endpoint
app.post('/webhook', verifyWebhookSignature, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    const payload = req.body as WebhookPayload;
    
    // Log webhook receipt
    console.log(`[${requestId}] Received webhook:`, {
      type: payload.type,
      cast: payload.cast?.text,
      author: payload.cast?.author?.username
    });

    // Send immediate response
    res.status(200).json({ status: 'received' });

    // Process webhook asynchronously
    if (payload.type === 'cast.created' && payload.cast) {
      const { cast } = payload;
      
      try {
        // Handle mentions if cast exists and has mentions
        if (cast.mentions?.some(m => m.fid === process.env.BOT_FID)) {
          await handleMention(cast, requestId);
        }

        // Check for collection-related content
        if (cast.text && isCollectibleRelated(cast.text)) {
          await shareToCollectorsCanyon(cast, requestId);
        }
      } catch (error) {
        console.error(`[${requestId}] Error processing cast:`, error);
      }
    }
  } catch (error) {
    console.error(`[${requestId}] Webhook error:`, error);
    // Don't send error response here since we already sent 200 OK
  }
});

async function handleMention(cast: WebhookPayload['cast'], requestId: string) {
  if (!cast) return;
  
  try {
    console.log(`[${requestId}] Processing mention from @${cast.author.username}`);
    
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
    throw error;
  }
}

async function shareToCollectorsCanyon(cast: WebhookPayload['cast'], requestId: string) {
  if (!cast) return;
  
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

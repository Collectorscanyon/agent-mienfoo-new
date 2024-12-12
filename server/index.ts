import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Type definitions
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
const requiredEnvVars = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET'] as const;
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

// Initialize Neynar client with type-safe configuration
const neynarClient = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY!
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

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET
    }
  });
});

// Test endpoint to verify configuration and connectivity
app.get('/test', async (_req, res) => {
  try {
    console.log('Test endpoint called, checking configuration...');
    
    // Configuration check
    const config = {
      status: 'ok',
      message: 'Farcaster Collectors Bot is running',
      server: {
        port: PORT,
        timestamp: new Date().toISOString()
      },
      config: {
        initialized: !!neynarClient,
        hasApiKey: !!process.env.NEYNAR_API_KEY,
        hasSignerUuid: !!process.env.SIGNER_UUID,
        hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
        botFid: process.env.BOT_FID
      }
    };

    console.log('Configuration check complete:', config);
    res.json(config);
  } catch (error) {
    console.error('Test endpoint error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to check server configuration',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Webhook endpoint
app.post('/webhook', verifyWebhookSignature, async (req, res) => {
  // Send immediate response to prevent timeouts
  res.status(200).json({ status: 'processing' });
  
  try {
    const payload = req.body as WebhookPayload;
    console.log('Webhook received:', {
      type: payload.type,
      text: payload.cast?.text,
      mentions: payload.cast?.mentions
    });

    if (payload.type === 'cast.created' && payload.cast?.mentions?.some(m => m.fid === process.env.BOT_FID)) {
      try {
        console.log('Processing bot mention from:', payload.cast.author.username);
        
        // Add like reaction
        try {
          await neynarClient.publishReaction({
            signerUuid: process.env.SIGNER_UUID!,
            reactionType: 'like',
            target: payload.cast.hash
          });
          console.log('Successfully liked the cast');
        } catch (reactionError) {
          console.error('Error publishing reaction:', reactionError instanceof Error ? reactionError.message : 'Unknown error');
        }

        // Reply in collectors canyon channel
        try {
          await neynarClient.publishCast({
            signerUuid: process.env.SIGNER_UUID!,
            text: `Hey @${payload.cast.author.username}! 👋 Welcome to Collectors Canyon! Let's talk about your collection! #CollectorsWelcome`,
            channelId: 'collectorscanyon'
          });
          console.log('Successfully published response cast');
        } catch (castError) {
          console.error('Error publishing cast:', castError instanceof Error ? castError.message : 'Unknown error');
        }
      } catch (processError) {
        console.error('Error processing cast:', processError instanceof Error ? processError.message : 'Unknown error');
      }
    }
  } catch (error) {
    console.error('Webhook error:', error instanceof Error ? error.message : 'Unknown error');
  }
});

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Ready for webhook requests');
}).on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

import express, { Request, Response, NextFunction } from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Express and middleware
const app = express();
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Verify required environment variables
const required = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('Missing required environment variables:', missing);
  process.exit(1);
}

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: process.env.NEYNAR_API_KEY || ''
});

// Webhook verification middleware
const verifyWebhookSignature = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-neynar-signature'];
  if (!signature || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const hmac = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (`sha256=${hmac}` !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    config: {
      hasApiKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET
    }
  });
});

// Test cast endpoint
app.get('/test-cast', async (_req: Request, res: Response) => {
  try {
    const response = await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `🎭 Testing Collectors Canyon Bot - ${new Date().toISOString()}`,
      channelId: 'collectorscanyon'
    });
    
    res.json({ status: 'success', cast: response });
  } catch (error) {
    console.error('Cast error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Webhook endpoint with immediate response
app.post('/webhook', verifyWebhookSignature, (req: Request, res: Response) => {
  // Send immediate response to prevent timeout
  res.status(200).send('OK');
  
  // Process webhook asynchronously
  setImmediate(async () => {
    try {
      const { type, cast } = req.body;
      console.log('Processing webhook:', { type, cast });
      
      if (type === 'cast.created' && cast?.mentions?.some((m: any) => m.fid === process.env.BOT_FID)) {
        // Add like reaction
        await neynar.publishReaction({
          signerUuid: process.env.SIGNER_UUID || '',
          reactionType: 'like',
          target: cast.hash
        });
        
        // Reply to mention
        await neynar.publishCast({
          signerUuid: process.env.SIGNER_UUID || '',
          text: `Hey @${cast.author.username}! 👋 Welcome to Collectors Canyon! #CollectorsWelcome`,
          parent: cast.hash,
          channelId: 'collectorscanyon'
        });
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
    }
  });
});

// Start server
const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Server running on port ${PORT}`);
  console.log('👂 Ready for webhook requests');
}).on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

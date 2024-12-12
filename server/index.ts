import express, { type Request, Response } from "express";
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from "cors";
import { config } from './config';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';

const app = express();

// Initialize Neynar client
const neynar = new NeynarAPIClient({ apiKey: config.NEYNAR_API_KEY });

// Logging configuration status
console.log('Bot Configuration:', {
  hasNeynarKey: !!config.NEYNAR_API_KEY,
  hasSignerUuid: !!config.SIGNER_UUID,
  hasOpenAIKey: !!config.OPENAI_API_KEY,
  botUsername: config.BOT_USERNAME,
  port: config.PORT
});

// Middleware setup
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Initialize scheduler for periodic channel posts
initializeScheduler();

// Webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { type, cast } = req.body;
    
    console.log('Webhook received:', {
      type,
      castText: cast?.text,
      author: cast?.author?.username,
      hasMentions: !!cast?.mentions?.length
    });

    // Process mentions and channel-relevant content
    if (type === 'mention' || type === 'cast.created') {
      const isMentioned = cast?.mentions?.some((m: any) => 
        m.fid === config.BOT_FID) || 
        cast?.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);

      if (isMentioned) {
        console.log('Processing mention from:', cast.author.username);
        await handleMention(cast);
      }
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    botUsername: config.BOT_USERNAME,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🤖 Mienfoo bot running on port ${config.PORT}`);
  console.log(`🎯 Listening for mentions @${config.BOT_USERNAME}`);
  console.log('📝 Ready to engage in /collectorscanyon');
});

export { neynar };

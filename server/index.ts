import express, { type Request, Response } from "express";
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import cors from "cors";
import { config } from './config';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';

const app = express();

// Detailed logging of environment variables (without exposing sensitive data)
console.log('Environment Check:', {
  hasApiKey: !!config.NEYNAR_API_KEY,
  hasSignerUuid: !!config.SIGNER_UUID,
  port: config.PORT
});

// Initialize Neynar with proper configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
});

export const neynar = new NeynarAPIClient(neynarConfig);

app.use(cors());
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    headers: req.headers,
    body: req.body
  });
  next();
});

// Initialize scheduler for periodic casts
initializeScheduler();

// Webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('Webhook Received:', {
      type: req.body.type,
      cast: {
        text: req.body.cast?.text,
        authorUsername: req.body.cast?.author?.username,
        mentions: req.body.cast?.mentions
      }
    });

    const { type, cast } = req.body;

    // Check for mentions or relevant casts
    if ((type === 'mention' || type === 'cast.created') && cast?.mentions?.some((m: any) => 
      m.fid === config.BOT_FID || cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`))) {
      console.log('Bot mention detected, handling...');
      await handleMention(cast);
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint
app.get('/test', (_req: Request, res: Response) => {
  res.json({ message: 'Bot is alive! 🤖' });
});

// Start server
app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🤖 Server running on port ${config.PORT}`);
  console.log('🎯 Bot ready to handle mentions and reactions');
});

import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from 'crypto';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';
import { config } from './config';

function verifySignature(signature: string, body: string): boolean {
  const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

export function registerRoutes(app: Express): Server {
  // Initialize scheduler for daily casts
  initializeScheduler();

  // Test endpoint
  app.get('/api/test', (_req, res) => {
    res.json({ message: 'Bot is alive! 🤖' });
  });

  // Webhook endpoint for Neynar
  app.post('/api/webhook', async (req, res) => {
    try {
      const rawBody = JSON.stringify(req.body);
      console.log('Received webhook:', {
        type: req.body.type,
        text: req.body.cast?.text,
        author: req.body.cast?.author?.username
      });

      // Verify webhook signature
      const signature = req.headers['x-neynar-signature'] as string;
      if (!signature || !verifySignature(signature, rawBody)) {
        console.log('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const { type, cast } = req.body;
      
      // Enhanced mention detection
      const isMentioned = cast?.mentions?.some((m: any) => m.fid === config.BOT_FID) || 
                         cast?.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);
      
      console.log('Cast analysis:', {
        type,
        text: cast?.text,
        hasMentions: !!cast?.mentions?.length,
        isBotMentioned: isMentioned,
        botFid: config.BOT_FID,
        botUsername: config.BOT_USERNAME
      });

      if (isMentioned) {
        console.log('Bot mention detected, processing cast:', cast);
        await handleMention(cast);
      } else {
        console.log('Skipping cast - no bot mention detected');
      }

      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from 'crypto';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';
import { WEBHOOK_SECRET } from './config';

function verifySignature(signature: string, body: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
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
      console.log('Received webhook request:', {
        headers: req.headers,
        body: req.body
      });

      // Verify webhook signature
      const signature = req.headers['x-neynar-signature'] as string;
      const secret = WEBHOOK_SECRET;
      
      if (!signature || !verifySignature(signature, JSON.stringify(req.body), secret)) {
        console.log('Webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const { type, cast } = req.body;
      
      console.log('Processing webhook:', { type, cast });

      // Handle different webhook events
      switch(type) {
        case 'mention':
          console.log('Handling mention event');
          await handleMention(cast);
          break;
        case 'cast.created':
          if (cast?.mentions?.includes(process.env.BOT_FID)) {
            console.log('Handling cast with bot mention');
            await handleMention(cast);
          }
          break;
        default:
          console.log(`Unhandled event type: ${type}`);
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

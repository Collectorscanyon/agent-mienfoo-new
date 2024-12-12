import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from 'crypto';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';
import { WEBHOOK_SECRET, BOT_FID, BOT_USERNAME } from './config';

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
        body: JSON.stringify(req.body, null, 2)
      });

      // Verify webhook signature
      const signature = req.headers['x-neynar-signature'] as string;
      const secret = WEBHOOK_SECRET;
      
      if (!signature || !verifySignature(signature, JSON.stringify(req.body), secret)) {
        console.log('Webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const { type, cast } = req.body;
      
      console.log('🤖 Processing webhook:', { 
        type,
        cast_text: cast?.text,
        author: cast?.author?.username,
        mentions: cast?.mentions
      });

      // Handle different webhook events
      switch(type) {
        case 'mention':
        case 'cast.created':
          // Check if the cast mentions our bot by FID or username
          if (cast?.mentions?.includes(BOT_FID) || 
              cast?.text?.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) {
            console.log('Handling mention event for bot');
            await handleMention(cast);
          } else {
            console.log('Cast does not mention bot, ignoring');
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

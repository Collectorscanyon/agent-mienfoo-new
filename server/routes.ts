import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from 'crypto';
import { handleMention } from './bot/handlers';
import { initializeScheduler } from './bot/scheduler';

function verifySignature(signature: string, body: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(body).digest('hex');
  return signature === digest;
}

export function registerRoutes(app: Express): Server {
  // Initialize scheduler for daily casts
  initializeScheduler();

  // Webhook endpoint for Neynar
  app.post('/api/webhook', async (req, res) => {
    try {
      // Verify webhook signature
      const signature = req.headers['x-neynar-signature'] as string;
      const secret = process.env.WEBHOOK_SECRET as string;
      
      if (!signature || !verifySignature(signature, JSON.stringify(req.body), secret)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const { type, cast } = req.body;

      // Handle different webhook events
      switch(type) {
        case 'mention':
          await handleMention(cast);
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

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

  // Webhook endpoint for Neynar with enhanced logging
  app.post('/api/webhook', async (req, res) => {
    const requestId = crypto.randomBytes(4).toString('hex');
    const timestamp = new Date().toISOString();

    try {
      console.log('Webhook request received:', {
        requestId,
        timestamp,
        method: req.method,
        headers: {
          'content-type': req.headers['content-type'],
          'x-neynar-signature': req.headers['x-neynar-signature'] ? 
            `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
        },
        body: req.body
      });

      // Check request body
      if (!req.body || typeof req.body !== 'object') {
        console.error('Invalid request body:', {
          requestId,
          timestamp,
          body: req.body
        });
        return res.status(400).json({ error: 'Invalid request body' });
      }

      // Verify webhook signature in production
      if (process.env.NODE_ENV === 'production') {
        const signature = req.headers['x-neynar-signature'] as string;
        const rawBody = JSON.stringify(req.body);
        if (!signature || !verifySignature(signature, rawBody)) {
          console.warn('Invalid webhook signature:', {
            requestId,
            timestamp,
            signature: signature ? `${signature.substring(0, 10)}...` : 'missing'
          });
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
      
      const { type, cast } = req.body;
      
      // Enhanced mention detection with detailed logging
      const isMentioned = cast?.mentions?.some((m: any) => m.fid === config.BOT_FID) || 
                         cast?.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);
      
      console.log('Cast analysis:', {
        requestId,
        timestamp,
        type,
        text: cast?.text,
        hasMentions: !!cast?.mentions?.length,
        isBotMentioned: isMentioned,
        botFid: config.BOT_FID,
        botUsername: config.BOT_USERNAME,
        mentions: cast?.mentions
      });

      if (isMentioned) {
        console.log('Bot mention detected, processing cast:', {
          requestId,
          timestamp,
          cast: {
            hash: cast.hash,
            text: cast.text,
            author: cast.author
          }
        });
        await handleMention(cast);
      } else {
        console.log('Skipping cast - no bot mention detected:', {
          requestId,
          timestamp
        });
      }

      console.log('Webhook processed successfully:', {
        requestId,
        timestamp
      });
      res.status(200).json({ status: 'success' });
    } catch (error) {
      console.error('Webhook handler error:', {
        requestId,
        timestamp,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? 
            error instanceof Error ? error.message : String(error) : 
            undefined
        });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

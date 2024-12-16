
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

router.post('/', express.json(), async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  console.log('Webhook request received:', {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
    }
  });

  try {
    // Verify webhook secret
    if (!process.env.WEBHOOK_SECRET) {
      console.error('Configuration error:', {
        requestId,
        timestamp,
        error: 'Missing WEBHOOK_SECRET environment variable'
      });
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify signature
    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature) {
      console.warn('Authentication error:', {
        requestId,
        timestamp,
        error: 'Missing x-neynar-signature header'
      });
      return res.status(401).json({ error: 'Missing signature header' });
    }

    // Validate request body
    if (!req.body?.type || !req.body?.data) {
      console.warn('Invalid request:', {
        requestId,
        timestamp,
        body: req.body,
        error: 'Missing required fields in webhook payload'
      });
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Log webhook details
    console.log('Processing webhook:', {
      requestId,
      timestamp,
      type: req.body.type,
      cast: {
        hash: req.body.data?.hash,
        text: req.body.data?.text,
        author: req.body.data?.author?.username,
        mentions: req.body.data?.mentioned_profiles
      }
    });

    // Send immediate acknowledgment
    res.status(202).json({ status: 'accepted' });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await handleWebhook(req);
        console.log('Webhook processed successfully:', {
          requestId,
          timestamp,
          type: req.body.type,
          hash: req.body.data?.hash
        });
      } catch (error) {
        console.error('Error processing webhook:', {
          requestId,
          timestamp,
          type: req.body.type,
          hash: req.body.data?.hash,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : String(error)
        });
      }
    });

  } catch (error) {
    console.error('Unhandled webhook error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;

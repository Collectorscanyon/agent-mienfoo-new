
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

// Production error handler
const errorHandler = (error: Error, req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);
  
  console.error('Webhook error:', {
    requestId,
    timestamp,
    path: req.path,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    } : error
  });

  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal server error',
      requestId,
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
};

router.post('/', express.json(), async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  // Enhanced request logging with full details
  console.log('Webhook received:', {
    requestId,
    timestamp,
    type: req.body?.type,
    text: req.body?.data?.text,
    author: req.body?.data?.author?.username,
    mentions: req.body?.data?.mentioned_profiles,
    signature: req.headers['x-neynar-signature'] ? 
      `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
  });

  // Detailed debug logging
  console.log('Full webhook payload:', {
    requestId,
    headers: req.headers,
    body: JSON.stringify(req.body, null, 2)
  });

  try {
    // Verify signature
    if (!process.env.WEBHOOK_SECRET) {
      throw new Error('Missing WEBHOOK_SECRET');
    }

    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Send immediate acknowledgment
    res.status(202).json({ status: 'accepted' });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await handleWebhook(req);
        console.log('Webhook processed:', { requestId, timestamp });
      } catch (error) {
        console.error('Webhook processing error:', {
          requestId,
          timestamp,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

  } catch (error) {
    console.error('Webhook error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? error.message : String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;

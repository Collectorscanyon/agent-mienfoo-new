
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

router.post('/', express.json(), async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(4).toString('hex');

  console.log('Webhook received:', {
    requestId,
    timestamp,
    body: req.body,
    signature: req.headers['x-neynar-signature']
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

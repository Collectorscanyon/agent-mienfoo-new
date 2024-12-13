import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

// Middleware to validate webhook requests
const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
  // Ensure request has the required content type
  if (req.headers['content-type'] !== 'application/json') {
    console.error('Invalid content type', {
      contentType: req.headers['content-type'],
      path: req.path,
      method: req.method
    });
    return res.status(400).json({ error: 'Invalid content type' });
  }

  // Verify Neynar signature
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Webhook secret not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!signature) {
    console.error('No signature provided', {
      path: req.path,
      method: req.method
    });
    return res.status(401).json({ error: 'Missing signature' });
  }

  const payload = JSON.stringify(req.body);
  const computedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  if (signature !== computedSignature) {
    console.error('Invalid webhook signature', {
      path: req.path,
      method: req.method,
      expectedSignature: computedSignature.substring(0, 10) + '...',
      receivedSignature: signature.substring(0, 10) + '...'
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
};

// Webhook endpoint
router.post('/webhook', validateWebhook, async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  try {
    console.log('Webhook received:', {
      requestId,
      timestamp,
      type: req.body.type,
      path: req.path,
      headers: {
        signature: (req.headers['x-neynar-signature'] as string)?.substring(0, 10) + '...',
        contentType: req.headers['content-type']
      }
    });

    // Send immediate acknowledgment
    res.status(200).json({ status: 'processing', requestId });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await handleWebhook(req.body);
        console.log('Webhook processed successfully:', { requestId, timestamp });
      } catch (error) {
        console.error('Error processing webhook:', {
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
    res.status(500).json({ error: 'Internal server error', requestId });
  }
});

export default router;

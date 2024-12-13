import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

// Request size limit for production
const requestSizeLimit = express.json({
  limit: '50kb'
});

// Enhanced signature verification
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const expectedSignature = hmac.update(payload).digest('hex');
    
    console.log('Signature verification:', {
      timestamp: new Date().toISOString(),
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...',
      matches: signature === expectedSignature
    });

    return process.env.NODE_ENV === 'development' || signature === expectedSignature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return process.env.NODE_ENV === 'development';
  }
}

router.post('/', requestSizeLimit, async (req: Request, res: Response) => {
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
    // Verify webhook secret is configured
    if (!process.env.WEBHOOK_SECRET) {
      console.error('Missing WEBHOOK_SECRET');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Verify signature
    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature) {
      console.warn('Missing signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const isValidSignature = verifySignature(
      JSON.stringify(req.body),
      signature,
      process.env.WEBHOOK_SECRET
    );

    if (!isValidSignature && process.env.NODE_ENV === 'production') {
      console.warn('Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Send immediate acknowledgment
    res.status(202).json({ 
      status: 'accepted',
      timestamp: new Date().toISOString()
    });

    // Process webhook asynchronously
    try {
      await handleWebhook({
        body: req.body,
        headers: req.headers,
        requestId
      });
    } catch (error) {
      console.error('Error processing webhook:', {
        requestId,
        timestamp,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
    }
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
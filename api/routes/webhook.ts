import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

// Enhanced logging middleware
const logRequest = (req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomBytes(4).toString('hex');
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
    },
    body: JSON.stringify(req.body).substring(0, 200) + '...'
  });
  
  // Attach requestId for later use
  res.locals.requestId = requestId;
  res.locals.timestamp = timestamp;
  next();
};

// Middleware to validate webhook requests
const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
  const { requestId, timestamp } = res.locals;

  // Ensure request has the required content type
  if (req.headers['content-type'] !== 'application/json') {
    console.error('Invalid content type', {
      requestId,
      timestamp,
      contentType: req.headers['content-type'],
      path: req.path,
      method: req.method
    });
    return res.status(400).json({ error: 'Invalid content type', requestId });
  }

  // Verify Neynar signature
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Webhook secret not configured', { requestId, timestamp });
    return res.status(500).json({ error: 'Server configuration error', requestId });
  }

  if (!signature) {
    console.error('No signature provided', {
      requestId,
      timestamp,
      path: req.path,
      method: req.method
    });
    return res.status(401).json({ error: 'Missing signature', requestId });
  }

  try {
    const payload = JSON.stringify(req.body);
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    console.log('Signature verification:', {
      requestId,
      timestamp,
      matches: signature === computedSignature,
      payloadLength: payload.length
    });

    if (signature !== computedSignature) {
      console.error('Invalid webhook signature', {
        requestId,
        timestamp,
        path: req.path,
        method: req.method,
        expectedSignature: `${computedSignature.substring(0, 10)}...`,
        receivedSignature: `${signature.substring(0, 10)}...`
      });
      return res.status(401).json({ error: 'Invalid signature', requestId });
    }

    next();
  } catch (error) {
    console.error('Error verifying signature:', {
      requestId,
      timestamp,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({ error: 'Signature verification failed', requestId });
  }
};

// Health check endpoint
router.get('/', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    message: 'Webhook endpoint is running',
    config: {
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasBotConfig: !!process.env.BOT_USERNAME && !!process.env.BOT_FID
    }
  });
});

// Webhook endpoint
router.post('/', logRequest, validateWebhook, async (req: Request, res: Response) => {
  const { requestId, timestamp } = res.locals;

  try {
    console.log('Processing webhook:', {
      requestId,
      timestamp,
      type: req.body.type,
      text: req.body.data?.text?.substring(0, 100),
      author: req.body.data?.author?.username
    });

    // Send immediate acknowledgment to prevent timeouts
    res.status(200).json({ status: 'processing', requestId });

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        await handleWebhook(req.body);
        console.log('Webhook processed successfully:', { 
          requestId, 
          timestamp,
          type: req.body.type
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
    });
  } catch (error) {
    console.error('Webhook error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', requestId });
    }
  }
});

// Catch-all for unsupported methods
router.all('/webhook', (req: Request, res: Response) => {
  console.warn('Unsupported method for webhook endpoint', {
    method: req.method,
    path: req.path
  });
  res.status(405).json({ error: 'Method not allowed' });
});

export default router;

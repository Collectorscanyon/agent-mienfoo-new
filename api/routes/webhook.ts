import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

// Request logging middleware with rate limiting
const requestsInWindow = new Map<string, number>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100;

const logRequest = (req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Rate limiting
  const currentRequests = requestsInWindow.get(clientIp) || 0;
  if (currentRequests >= MAX_REQUESTS) {
    console.warn('Rate limit exceeded:', { clientIp, requestId, timestamp });
    return res.status(429).json({ 
      error: 'Too many requests',
      retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
    });
  }
  requestsInWindow.set(clientIp, currentRequests + 1);
  
  console.log('Webhook request received:', {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    clientIp,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
    },
    bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'empty'
  });
  
  res.locals.requestId = requestId;
  res.locals.timestamp = timestamp;
  res.locals.clientIp = clientIp;
  next();
};

// Clean up rate limiting window periodically
setInterval(() => {
  requestsInWindow.clear();
}, RATE_LIMIT_WINDOW);

// Webhook validation middleware
const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
  const { requestId, timestamp, clientIp } = res.locals;

  // Validate content type
  if (!req.headers['content-type']?.includes('application/json')) {
    console.error('Invalid content type', {
      requestId,
      timestamp,
      clientIp,
      contentType: req.headers['content-type']
    });
    return res.status(400).json({ 
      error: 'Invalid content type',
      expected: 'application/json',
      received: req.headers['content-type']
    });
  }

  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    console.error('Invalid request body', {
      requestId,
      timestamp,
      clientIp,
      body: req.body
    });
    return res.status(400).json({ error: 'Invalid request body' });
  }

  // Verify Neynar signature
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing webhook secret', { requestId, timestamp });
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!signature) {
    console.error('Missing signature header', {
      requestId,
      timestamp,
      clientIp
    });
    return res.status(401).json({ error: 'Missing signature header' });
  }

  try {
    // Sort object keys recursively for consistent signature computation
    function sortObjectKeys(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
      }
      if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((result: any, key: string) => {
          result[key] = sortObjectKeys(obj[key]);
          return result;
        }, {});
      }
      return obj;
    }

    const sortedBody = sortObjectKeys(req.body);
    const payload = JSON.stringify(sortedBody);
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
  
    console.log('Signature verification:', {
      receivedSignature: signature,
      computedSignature,
      webhookSecretLength: webhookSecret.length,
      payloadPreview: payload.substring(0, 100) + '...',
      sortedKeys: Object.keys(sortedBody).sort().join(',')
    });

    if (computedSignature !== signature) {
      console.warn('Invalid signature', {
        expectedSignature: `${computedSignature.substring(0, 10)}...`,
        receivedSignature: `${signature.substring(0, 10)}...`
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('Signature verified', {
      requestId,
      timestamp,
      clientIp
    });
    next();
  } catch (error) {
    console.error('Signature verification error', {
      requestId,
      timestamp,
      clientIp,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(500).json({ error: 'Signature verification failed' });
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

// Enhanced webhook endpoint with detailed logging
router.post('/', express.json(), async (req: Request, res: Response) => {
  console.log('Raw webhook request received at endpoint:', {
    path: req.path,
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(req.body),
    timestamp: new Date().toISOString()
  });
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();
  
  console.log('Raw webhook request received:', {
    requestId,
    timestamp,
    path: req.path,
    method: req.method,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
    },
    body: req.body
  });

  try {
    // Apply middleware in sequence
    await new Promise((resolve, reject) => {
      logRequest(req, res, (err?: any) => err ? reject(err) : resolve(undefined));
    });
    
    await new Promise((resolve, reject) => {
      validateWebhook(req, res, (err?: any) => err ? reject(err) : resolve(undefined));
    });
  const { requestId, timestamp, clientIp } = res.locals;

  try {
    console.log('Processing webhook:', {
      requestId,
      timestamp,
      clientIp,
      type: req.body.type,
      text: req.body.data?.text?.substring(0, 100),
      author: req.body.data?.author?.username
    });

    // Send immediate acknowledgment
    res.status(202).json({ 
      status: 'accepted',
      message: 'Webhook received and being processed'
    });

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
        console.error('Webhook processing error:', {
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
    console.error('Webhook handler error:', {
      requestId,
      timestamp,
      clientIp,
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
          'An unexpected error occurred'
      });
    }
  }
});

export default router;
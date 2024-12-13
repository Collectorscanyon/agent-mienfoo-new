
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';
import { timingSafeEqual } from 'crypto';

const router = Router();

// Request size limit for production
const requestSizeLimit = express.json({
  limit: '50kb'
});

// Production-ready signature verification
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Use timing-safe comparison
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

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

// Production-ready rate limit error handler
const productionRateLimitHandler = (req: Request, res: Response) => {
  console.warn('Rate limit exceeded:', {
    ip: req.ip,
    path: req.path,
    timestamp: new Date().toISOString()
  });
  return res.status(429).json({
    error: 'Too many requests',
    retryAfter: '15m',
    code: 'RATE_LIMIT_EXCEEDED'
  });
};

// Production request validation
const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'Invalid request body',
      code: 'INVALID_PAYLOAD'
    });
  }
  next();
};

router.post('/', requestSizeLimit, validateRequest, async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  // Enhanced webhook request logging with full details
  console.log('Webhook request received:', {
    requestId,
    timestamp,
    headers: {
      signature: req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing',
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent']
    },
    body: {
      type: req.body?.type,
      data: {
        hash: req.body?.data?.hash,
        text: req.body?.data?.text,
        author: {
          username: req.body?.data?.author?.username,
          fid: req.body?.data?.author?.fid
        },
        mentions: req.body?.data?.mentioned_profiles?.map((p: any) => ({
          username: p.username,
          fid: p.fid
        })),
        parent_hash: req.body?.data?.parent_hash,
        thread_hash: req.body?.data?.thread_hash,
        channel: req.body?.data?.channel
      }
    },
    rawBody: process.env.NODE_ENV === 'development' ? JSON.stringify(req.body) : undefined
  });

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
    // Enhanced signature verification for production
    if (!process.env.WEBHOOK_SECRET) {
      console.error('Configuration error: Missing WEBHOOK_SECRET');
      return res.status(500).json({ 
        error: 'Server configuration error',
        code: 'MISSING_CONFIG'
      });
    }

    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature) {
      console.warn('Authentication error: Missing signature header');
      return res.status(401).json({ 
        error: 'Missing signature header',
        code: 'MISSING_SIGNATURE'
      });
    }

    // Enhanced signature verification with development mode support
    const isDevelopment = process.env.NODE_ENV !== 'production';
    let isValid = false;

    try {
      // In development, we'll log the signature details for debugging
      if (isDevelopment) {
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha256', process.env.WEBHOOK_SECRET || '')
          .update(payload)
          .digest('hex');
        
        console.log('Signature debug:', {
          received: signature,
          expected: expectedSignature,
          matches: signature === expectedSignature,
          timestamp: new Date().toISOString()
        });
        
        // In development, we'll accept the request even if signatures don't match
        isValid = true;
      } else {
        // In production, strictly verify the signature
        isValid = verifySignature(
          JSON.stringify(req.body),
          signature,
          process.env.WEBHOOK_SECRET || ''
        );
      }
    } catch (error) {
      console.error('Signature verification error:', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      // In development, continue despite errors
      isValid = isDevelopment;
    }

    console.log('Signature verification:', {
      timestamp: new Date().toISOString(),
      requestId,
      isDevelopment,
      hasSignature: !!signature,
      isValid,
      environment: process.env.NODE_ENV
    });

    if (!isValid) {
      console.warn('Authentication error: Invalid signature');
      return res.status(401).json({ 
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Send immediate acknowledgment
    res.status(202).json({ 
      status: 'accepted',
      timestamp: new Date().toISOString()
    });

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

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

export function validateWebhook(req: Request, res: Response, next: NextFunction) {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  logger.info('Validating webhook request:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    }
  });

  // Verify signature
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = config.WEBHOOK_SECRET;

  if (!signature && process.env.NODE_ENV === 'production') {
    logger.error('Missing signature header', { requestId });
    return res.status(401).json({ error: 'Missing signature' });
  }

  if (!webhookSecret) {
    logger.error('Missing webhook secret', { requestId });
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    if (process.env.NODE_ENV === 'production') {
      const hmac = crypto.createHmac('sha256', webhookSecret);
      const computedSignature = hmac.update(JSON.stringify(req.body)).digest('hex');
      
      if (signature !== computedSignature) {
        logger.error('Invalid signature', { requestId });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Attach requestId to request for tracking
    (req as any).requestId = requestId;
    next();
  } catch (error) {
    logger.error('Error validating webhook:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({ error: 'Webhook validation failed' });
  }
}

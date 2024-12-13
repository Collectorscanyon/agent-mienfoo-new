import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/environment';
import { handleWebhook } from '../bot/handlers';
import { logger } from '../utils/logger';

const router = Router();

// Track processed mentions to prevent duplicates
const processedMentions = new Set<string>();

// Verify Neynar webhook signature
function verifySignature(req: Request): boolean {
  const signature = req.headers['x-neynar-signature'];
  if (!signature || !config.WEBHOOK_SECRET) return false;

  const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
  const digest = hmac.update(req.rawBody).digest('hex');
  
  logger.info('Signature verification:', {
    timestamp: new Date().toISOString(),
    received: signature.substring(0, 10) + '...',
    computed: digest.substring(0, 10) + '...',
    matches: signature === digest
  });

  return signature === digest;
}

// Webhook endpoint with enhanced logging and proper signature verification
router.post('/', express.json({
  verify: (req: any, res: Buffer, buf: Buffer) => {
    req.rawBody = buf;
  },
  limit: '50kb'
}), async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  logger.info('Webhook received:', {
    requestId,
    timestamp: new Date().toISOString(),
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    }
  });

  try {
    // Verify signature in production
    if (process.env.NODE_ENV === 'production' && !verifySignature(req)) {
      logger.error('Invalid signature:', { requestId });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;

    logger.info('Processing webhook:', {
      requestId,
      type,
      data: {
        hash: data?.hash,
        text: data?.text,
        author: data?.author?.username
      }
    });

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Check for bot mention
    const isBotMentioned = data.mentioned_profiles?.some(
      (profile: any) => profile.username === config.BOT_USERNAME
    );

    if (!isBotMentioned) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    // Avoid duplicate processing
    if (processedMentions.has(data.hash)) {
      logger.info('Skipping duplicate mention:', { requestId, hash: data.hash });
      return res.status(200).json({ status: 'ignored', reason: 'already processed' });
    }

    // Send immediate acknowledgment before processing
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

      // Only mark as processed after successful handling
      processedMentions.add(data.hash);
      
      logger.info('Successfully processed mention:', {
        requestId,
        hash: data.hash
      });
    } catch (error) {
      logger.error('Error processing webhook:', {
        requestId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      });
    }
  } catch (error) {
    logger.error('Webhook error:', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;

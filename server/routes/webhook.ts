import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/environment';
import { handleWebhook } from '../bot/handlers';
import { logger } from '../utils/logger';

const router = Router();

// Track processed mentions to prevent duplicates
const processedMentions = new Set<string>();

// Verify Neynar webhook signature with proper prefix handling
function verifySignature(req: Request): boolean {
  const signature = req.headers['x-neynar-signature'];
  if (!signature || !config.WEBHOOK_SECRET) {
    logger.error('Missing signature or webhook secret');
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
    const digest = hmac.update(req.rawBody).digest('hex');
    const expectedSignature = `sha256=${digest}`;
    
    logger.info('Debug: Signature verification:', {
      timestamp: new Date().toISOString(),
      receivedSignature: signature.toString().substring(0, 20) + '...',
      expectedSignature: expectedSignature.substring(0, 20) + '...',
      matches: expectedSignature === signature.toString()
    });

    return crypto.timingSafeEqual(
      Buffer.from(signature.toString()),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('Debug: Signature verification error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

// Webhook endpoint with enhanced logging and proper signature verification
router.post('/', express.json({
  verify: (req: any, res: Buffer, buf: Buffer) => {
    req.rawBody = buf;
  },
  limit: '50kb'
}), async (req: Request, res: Response) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  logger.info('Debug: Webhook received:', {
    requestId,
    timestamp: new Date().toISOString(),
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    },
    body: JSON.stringify(req.body).substring(0, 200) + '...'
  });

  try {
    // Always verify signature in all environments for testing
    if (!verifySignature(req)) {
      logger.error('Debug: Invalid signature:', { 
        requestId,
        timestamp: new Date().toISOString()
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;

    logger.info('Debug: Processing webhook:', {
      requestId,
      timestamp: new Date().toISOString(),
      type,
      data: {
        hash: data?.hash,
        text: data?.text,
        author: {
          fid: data?.author?.fid,
          username: data?.author?.username,
          display_name: data?.author?.display_name
        },
        mentioned_profiles: data?.mentioned_profiles?.map((p: any) => ({
          fid: p.fid,
          username: p.username
        })),
        parent_hash: data?.parent_hash,
        parent_url: data?.parent_url,
        timestamp: data?.timestamp
      }
    });

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'not a cast event' 
      });
    }

    // Validate required fields
    if (!data?.hash || !data?.text || !data?.author) {
      logger.error('Invalid webhook data:', {
        requestId,
        data
      });
      return res.status(400).json({ 
        error: 'Invalid webhook data',
        missing: ['hash', 'text', 'author'].filter(field => !data?.[field])
      });
    }

    // Check for bot mention
    const isBotMentioned = data.mentioned_profiles?.some(
      (profile: any) => profile.username === config.BOT_USERNAME
    );

    if (!isBotMentioned) {
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'bot not mentioned' 
      });
    }

    // Avoid duplicate processing
    if (processedMentions.has(data.hash)) {
      logger.info('Skipping duplicate mention:', { 
        requestId, 
        hash: data.hash 
      });
      return res.status(200).json({ 
        status: 'ignored', 
        reason: 'already processed' 
      });
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

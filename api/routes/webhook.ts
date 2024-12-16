
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { handleWebhook } from '../bot/handlers';

const router = Router();

router.post('/', express.json(), async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  try {
    // 1. Initial request logging with comprehensive details
    try {
      console.log('Webhook request received:', {
        requestId,
        timestamp,
        method: req.method,
        path: req.path,
        headers: {
          'content-type': req.headers['content-type'],
          'x-neynar-signature': req.headers['x-neynar-signature'] ? 
            (typeof req.headers['x-neynar-signature'] === 'string' ? 
              req.headers['x-neynar-signature'].substring(0, 10) + '...' : 
              'invalid format') : 'missing',
          'user-agent': req.headers['user-agent']
        },
        body: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'empty'
      });
    } catch (loggingError) {
      console.error('Error logging request:', {
        timestamp,
        error: loggingError instanceof Error ? loggingError.message : String(loggingError)
      });
      // Continue processing even if logging fails
    }

    // 2. Configuration and signature verification
    try {
      if (!process.env.WEBHOOK_SECRET) {
        throw new Error('Missing WEBHOOK_SECRET');
      }

      const signature = req.headers['x-neynar-signature'];
      if (!signature || typeof signature !== 'string') {
        console.warn('Invalid signature:', {
          requestId,
          timestamp,
          receivedSignature: signature ? 
            (Array.isArray(signature) ? '[Array]' : `${String(signature).substring(0, 10)}...`) : 
            'missing'
        });
        return res.status(401).json({ error: 'Invalid or missing signature' });
      }

      // 3. Payload validation
      if (!req.body?.type || !req.body?.data) {
        console.warn('Invalid payload structure:', {
          requestId,
          timestamp,
          validation: {
            hasBody: !!req.body,
            hasType: !!req.body?.type,
            hasData: !!req.body?.data
          },
          receivedBody: req.body ? JSON.stringify(req.body).substring(0, 100) + '...' : 'missing'
        });
        return res.status(400).json({ error: 'Invalid webhook payload structure' });
      }

      // 4. Detailed webhook logging
      console.log('Valid webhook received:', {
        requestId,
        timestamp,
        type: req.body.type,
        data: {
          text: req.body.data?.text?.substring(0, 100),
          author: req.body.data?.author?.username,
          hasMentions: !!req.body.data?.mentioned_profiles
        },
        signaturePreview: signature.substring(0, 10) + '...'
      });

    // Log full webhook payload for debugging
    console.log('Full webhook payload:', {
      requestId,
      headers: req.headers,
      body: req.body
    });

    // 5. Send immediate acknowledgment
      res.status(202).json({ status: 'accepted' });

      // 6. Process webhook asynchronously
      setImmediate(async () => {
        try {
          await handleWebhook(req);
          console.log('Webhook processed successfully:', {
            requestId,
            timestamp,
            type: req.body.type,
            hash: req.body.data?.hash
          });
        } catch (error) {
          console.error('Error in webhook processing:', {
            requestId,
            timestamp,
            context: {
              type: req.body.type,
              hash: req.body.data?.hash,
              author: req.body.data?.author?.username
            },
            error: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split('\n'),
              isOperational: error.name !== 'TypeError' && error.name !== 'ReferenceError'
            } : String(error)
          });
        }
      });

      // 7. Additional logging for async processing start
      console.log('Webhook queued for processing:', {
        requestId,
        timestamp,
        hash: req.body.data?.hash
      });

  } catch (error) {
    // Enhanced error logging for unexpected errors
    console.error('Unhandled webhook error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n')
      } : String(error),
      context: {
        method: req.method,
        path: req.path,
        hasBody: !!req.body,
        hasSignature: !!req.headers['x-neynar-signature']
      }
    });
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;

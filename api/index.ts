import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response } from 'express';
import { handleWebhook } from './bot/handlers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Verify required environment variables
if (!process.env.OPENAI_API_KEY || !process.env.NEYNAR_API_KEY) {
    throw new Error('Missing required API keys');
}

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced logging middleware
app.use((req: Request, res: Response, next) => {
    const requestId = Math.random().toString(36).substring(7);
    const timestamp = new Date().toISOString();
    
    console.log('Request received:', {
        requestId,
        timestamp,
        method: req.method,
        path: req.path,
        headers: req.headers,
        body: req.body,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY
    });
    next();
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        message: 'Bot API is running',
        config: {
            hasOpenAIKey: !!process.env.OPENAI_API_KEY,
            hasNeynarKey: !!process.env.NEYNAR_API_KEY,
            hasBotConfig: !!process.env.BOT_USERNAME
        }
    });
});

// Webhook endpoint with enhanced error handling and validation
app.post(['/', '/webhook'], async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log('Webhook received:', {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasNeynarKey: !!process.env.NEYNAR_API_KEY,
    signature: req.headers['x-neynar-signature']
  });

  // Enhanced signature verification
  const signature = req.headers['x-neynar-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('Missing webhook secret:', { requestId, timestamp });
    return res.status(500).send('Server configuration error');
  }

  try {
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const rawBody = JSON.stringify(req.body);
    const computedSignature = hmac.update(rawBody).digest('hex');
    
    console.log('Signature verification:', {
      requestId,
      timestamp,
      hasSignature: !!signature,
      signatureMatch: computedSignature === signature,
      receivedSignature: signature?.substring(0, 10) + '...',
      computedSignaturePrefix: computedSignature.substring(0, 10) + '...'
    });

    if (!signature || computedSignature !== signature) {
      console.error('Invalid webhook signature:', {
        requestId,
        timestamp,
        path: req.path,
        receivedSignature: signature?.substring(0, 10) + '...',
        computedSignature: computedSignature.substring(0, 10) + '...'
      });
      return res.status(401).json({ error: 'Invalid signature', details: 'Signature verification failed' });
    }
  } catch (error) {
    console.error('Error verifying signature:', error);
    return res.status(500).json({ error: 'Internal server error', details: 'Error processing signature' });
  }

  // Check if the payload includes required fields
  const { type, data } = req.body;
  if (!type || !data) {
    console.log('Invalid webhook payload:', { 
      requestId, 
      timestamp, 
      type, 
      hasData: !!data,
      receivedFields: Object.keys(req.body)
    });
    return res.status(400).send('Missing required fields in request body');
  }

  // Verify that we have required environment variables
  if (!process.env.OPENAI_API_KEY || !process.env.NEYNAR_API_KEY) {
    console.error('Missing required API keys:', {
      requestId,
      timestamp,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY
    });
    return res.status(500).send('Server configuration error');
  }

  // Send immediate 200 OK response to acknowledge receipt
  res.status(200).send('Webhook event processed successfully!');

  try {
    if (type === 'cast.created' && data.text) {
      const startTime = Date.now();
      console.log('Processing cast:', {
        requestId,
        timestamp,
        text: data.text,
        hash: data.hash,
        author: data.author?.username,
        isMention: data.text.toLowerCase().includes('@mienfoo.eth'),
        hasThreadHash: !!data.thread_hash,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        processingStart: new Date().toISOString()
      });

      // Process webhook asynchronously
      setImmediate(async () => {
        try {
          const { handleWebhook } = await import('./bot/handlers');
          
          await handleWebhook({
            type: 'cast.created',
            data: {
              hash: data.hash,
              text: data.text,
              author: data.author,
              thread_hash: data.thread_hash,
              mentioned_profiles: data.mentioned_profiles || []
            }
          });

          console.log('Cast processing completed:', {
            requestId,
            timestamp,
            hash: data.hash,
            processingTimeMs: Date.now() - startTime,
            success: true
          });
        } catch (error) {
          console.error('Error in async webhook processing:', {
            requestId,
            timestamp,
            error: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            } : error,
            data: {
              hash: data.hash,
              hasText: !!data.text,
              hasAuthor: !!data.author
            }
          });
        }
      });
    } else {
      console.log('Skipping non-cast or empty text event:', {
        requestId,
        timestamp,
        type,
        hasText: !!data?.text
      });
    }
  } catch (error) {
    console.error('Error in webhook handler:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      type,
      data: {
        hash: data.hash,
        hasText: !!data.text,
        hasAuthor: !!data.author
      }
    });
  }
});

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    const expressReq = Object.assign(req, {
      get: (header: string) => req.headers[header],
      header: (header: string) => req.headers[header],
      accepts: () => true,
    });

    const expressRes = Object.assign(res, {
      status: (statusCode: number) => {
        res.status(statusCode);
        return expressRes;
      },
      json: (body: any) => {
        res.json(body);
        return expressRes;
      },
      send: (body: any) => {
        res.send(body);
        return expressRes;
      }
    });

    app(expressReq as any, expressRes as any, (err?: any) => {
      if (err) {
        console.error('Express error:', err);
        reject(err);
      } else {
        resolve(undefined);
      }
    });
  });
}

// Start local server if not in Vercel environment
if (process.env.VERCEL !== '1') {
    const port = parseInt(process.env.PORT || '5000', 10);
    app.listen(port, '0.0.0.0', () => {
        const timestamp = new Date().toISOString();
        console.log('Server started successfully:', {
            timestamp,
            port,
            environment: process.env.NODE_ENV,
            botConfig: {
                username: process.env.BOT_USERNAME,
                fid: process.env.BOT_FID,
                hasNeynarKey: !!process.env.NEYNAR_API_KEY,
                hasSignerUuid: !!process.env.SIGNER_UUID,
                hasOpenAIKey: !!process.env.OPENAI_API_KEY
            }
        });
    });
}
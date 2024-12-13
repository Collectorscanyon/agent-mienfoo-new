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

// Webhook endpoint with enhanced error handling, validation and detailed logging
app.post('/webhook', async (req: Request, res: Response) => {
  const requestContext = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };
  
  console.log('Webhook request received:', {
    ...requestContext,
    hasSignature: !!req.headers['x-neynar-signature'],
    contentType: req.headers['content-type'],
    bodySize: JSON.stringify(req.body).length,
    hasOpenAIKey: !!process.env.OPENAI_API_KEY,
    hasNeynarKey: !!process.env.NEYNAR_API_KEY
  });

  // Validate environment configuration
  if (!process.env.WEBHOOK_SECRET) {
    console.error('Missing webhook secret:', requestContext);
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Missing webhook secret'
    });
  }

  if (!process.env.OPENAI_API_KEY || !process.env.NEYNAR_API_KEY) {
    console.error('Missing required API keys:', {
      ...requestContext,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY
    });
    return res.status(500).json({ 
      error: 'Server configuration error', 
      details: 'Missing required API keys'
    });
  }

  // Verify signature
  try {
    const signature = req.headers['x-neynar-signature'] as string;
    if (!signature) {
      console.warn('No signature provided:', requestContext);
      return res.status(401).json({ 
        error: 'Unauthorized', 
        details: 'Missing signature header'
      });
    }

    const rawBody = JSON.stringify(req.body);
    const crypto = await import('crypto');
    const computedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    
    if (computedSignature !== signature) {
      console.error('Invalid signature:', {
        ...requestContext,
        receivedSignature: signature.substring(0, 10) + '...',
        computedSignature: computedSignature.substring(0, 10) + '...'
      });
      return res.status(401).json({ 
        error: 'Unauthorized', 
        details: 'Invalid signature'
      });
    }

    // Validate payload
    const { type, data } = req.body;
    if (!type || !data) {
      console.warn('Invalid payload:', { 
        ...requestContext,
        receivedFields: Object.keys(req.body)
      });
      return res.status(400).json({ 
        error: 'Bad Request', 
        details: 'Missing required fields'
      });
    }

    // Process webhook event
    if (type === 'cast.created' && data.text) {
      const startTime = Date.now();
      console.log('Valid cast event received:', {
        ...requestContext,
        text: data.text,
        hash: data.hash,
        author: data.author?.username,
        isMention: data.text.toLowerCase().includes('@mienfoo.eth')
      });

      // Send immediate acknowledgment
      res.status(200).json({ 
        message: 'Webhook received and validated', 
        status: 'processing'
      });

      // Process asynchronously
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

          console.log('Cast processed successfully:', {
            ...requestContext,
            hash: data.hash,
            processingTimeMs: Date.now() - startTime
          });
        } catch (error) {
          console.error('Cast processing failed:', {
            ...requestContext,
            hash: data.hash,
            error: error instanceof Error ? {
              name: error.name,
              message: error.message,
              stack: error.stack
            } : error
          });
        }
      });
    } else {
      console.log('Skipping non-cast event:', {
        ...requestContext,
        type,
        hasText: !!data?.text
      });
      return res.status(200).json({ 
        message: 'Non-cast event acknowledged', 
        status: 'skipped'
      });
    }
  } catch (error) {
    console.error('Webhook processing error:', {
      ...requestContext,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });
    return res.status(500).json({ 
      error: 'Internal Server Error',
      details: 'Error processing webhook'
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
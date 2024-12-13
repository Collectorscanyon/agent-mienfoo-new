import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response } from 'express';
import { handleWebhook } from './bot/handlers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook endpoint
app.post('/webhook', async (req: Request, res: Response) => {
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
    hasNeynarKey: !!process.env.NEYNAR_API_KEY
  });

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
      console.log('Processing cast:', {
        requestId,
        timestamp,
        text: data.text,
        hash: data.hash,
        author: data.author?.username,
        isMention: data.text.toLowerCase().includes('@mienfoo.eth'),
        hasThreadHash: !!data.thread_hash
      });

      // Import and use handler for cast processing
      const { handleWebhook } = await import('./bot/handlers');
      
      const startTime = Date.now();
      await handleWebhook({
        type: 'cast.created',
        data: {
          hash: data.hash,
          text: data.text,
          author: data.author,
          thread_hash: data.thread_hash
        }
      });
      const processingTime = Date.now() - startTime;

      console.log('Cast processing completed:', {
        requestId,
        timestamp,
        hash: data.hash,
        processingTimeMs: processingTime,
        success: true
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
    console.error('Error processing webhook:', {
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
  // Convert Vercel's request to Express compatible format
  const expressReq = Object.assign(req, {
    get: (header: string) => req.headers[header],
    header: (header: string) => req.headers[header],
    accepts: () => true, // Simplified accepts implementation
  });
  
  return new Promise((resolve, reject) => {
    app(expressReq as any, res, (err?: any) => {
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
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log('Bot configuration:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}
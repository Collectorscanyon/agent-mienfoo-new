import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as any).rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    contentType: req.headers['content-type'],
    body: req.body,
    rawBody: (req as any).rawBody
  });
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Bot API is running',
    env: process.env.NODE_ENV || 'development'
  });
});

// Webhook handler
const webhookHandler = async (req: Request | VercelRequest, res: Response | VercelResponse) => {
  // Send 200 OK immediately to prevent retries
  res.status(200);

  const timestamp = new Date().toISOString();
  console.log('Processing webhook request:', {
    timestamp,
    method: req.method,
    path: req.url,
    headers: req.headers,
    contentType: req.headers['content-type'],
    body: req.body
  });

  try {
    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      console.warn('Invalid request body:', {
        timestamp,
        body: req.body,
        contentType: req.headers['content-type']
      });
      return res.json({
        success: false,
        error: 'Invalid request body',
        message: 'Request body must be a valid JSON object'
      });
    }

    // Extract and validate webhook data
    const { type, data } = req.body;

    console.log('Webhook payload:', {
      timestamp,
      type,
      data: JSON.stringify(data, null, 2),
      rawBody: (req as any).rawBody
    });

    if (!type || !data) {
      console.warn('Missing required fields:', {
        timestamp,
        type,
        hasData: !!data,
        body: req.body
      });
      return res.json({
        success: false,
        error: 'Missing required fields',
        message: 'Request must include "type" and "data" fields'
      });
    }

    // Handle Farcaster cast.created events
    if (type === 'cast.created' && data) {
      // Process webhook asynchronously
      handleWebhook(req.body).catch(err => {
        console.error('Error in webhook processing:', err);
      });
      
      return res.json({
        success: true,
        message: 'Webhook accepted for processing',
        timestamp
      });
    }

    // Handle test requests
    return res.json({
      success: true,
      message: 'Webhook received',
      timestamp,
      type,
      dataReceived: !!data
    });

  } catch (error) {
    console.error('Error in webhook handler:', {
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      body: req.body,
      rawBody: (req as any).rawBody
    });

    return res.json({
      success: false,
      error: 'Webhook processing error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    });
  }
};

// Register webhook routes
app.post(['/api/webhook', '/webhook'], webhookHandler);

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    app(req, res, (err) => {
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
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`Listening on http://0.0.0.0:${port}`);
    console.log('Bot configuration:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}
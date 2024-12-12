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

// Simple webhook handler
app.post(['/api/webhook', '/webhook'], (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  
  // Log the incoming request
  console.log('Webhook request received:', {
    timestamp,
    method: req.method,
    headers: req.headers,
    body: req.body,
    url: req.url
  });

  // Send immediate 200 OK response
  res.status(200).json({
    success: true,
    message: 'Webhook received',
    timestamp,
    receivedBody: req.body
  });

  // Process the webhook asynchronously if it's valid
  if (req.body && req.body.type === 'cast.created' && req.body.data) {
    handleWebhook(req.body).catch(error => {
      console.error('Error processing webhook:', {
        timestamp,
        error: error instanceof Error ? error.message : error,
        body: req.body
      });
    });
  }
});

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
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure body parsing middleware first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log('Request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    },
    body: req.body
  });
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook endpoint with explicit logging
app.post('/webhook', async (req, res) => {
  const timestamp = new Date().toISOString();
  
  console.log('Webhook request received:', {
    timestamp,
    path: '/webhook',
    headers: req.headers,
    body: req.body
  });

  // Validate request body
  if (!req.body || !req.body.type || !req.body.data) {
    console.log('Invalid webhook payload:', { timestamp, body: req.body });
    return res.status(400).json({ 
      error: 'Invalid webhook payload',
      timestamp 
    });
  }

  // Send immediate 200 OK response
  res.status(200).send('OK');

  try {
    // Process webhook asynchronously
    await handleWebhook(req.body);
    console.log('Webhook processed successfully:', {
      timestamp,
      type: req.body.type
    });
  } catch (error) {
    console.error('Error processing webhook:', {
      timestamp,
      error: error instanceof Error ? error.message : error,
      body: req.body
    });
  }
});

// Vercel serverless handler
export default function handler(req: VercelRequest, res: VercelResponse) {
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
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log('Bot configuration:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}
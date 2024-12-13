import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Configure body parsing middleware before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic request logging
app.use((req, res, next) => {
  console.log('Incoming request:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    contentType: req.headers['content-type'],
    body: req.body
  });
  next();
});

// Health check endpoint
app.get(['/', '/health'], (req, res) => {
  res.json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  console.log('Webhook received:', {
    timestamp: new Date().toISOString(),
    body: req.body
  });

  if (!req.body) {
    console.log('No request body received');
    return res.status(400).json({ error: 'No request body' });
  }

  // Send immediate 200 OK response
  res.status(200).send('OK');

  // Process webhook asynchronously if it's a valid cast
  if (req.body.type === 'cast.created' && req.body.data) {
    handleWebhook(req.body).catch(error => {
      console.error('Webhook processing error:', error);
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
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log('Bot configuration:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}
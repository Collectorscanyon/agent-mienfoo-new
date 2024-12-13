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
  console.log('Webhook endpoint hit with body:', req.body);

  // Check if the payload includes required fields
  const { type, data } = req.body;
  if (!type || !data) {
    console.log('No "type" or "data" field found in the request body.');
    return res.status(400).send('Missing required fields in request body');
  }

  // Send immediate 200 OK response
  res.status(200).send('Webhook event processed successfully!');

  try {
    // Process webhook asynchronously
    await handleWebhook({ type, data });
    console.log('Webhook processed successfully:', {
      timestamp: new Date().toISOString(),
      type,
      data
    });
  } catch (error) {
    console.error('Error processing webhook:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : error,
      type,
      data
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
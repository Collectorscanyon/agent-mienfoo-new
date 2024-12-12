import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';

// Initialize Express app
const app = express();

// Enhanced request logging middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log('Request details:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook handler
const webhookHandler = async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Send immediate acknowledgment
    res.status(200).send('OK');

    // Log webhook payload
    console.log('Processing webhook:', {
      timestamp: new Date().toISOString(),
      type: req.body?.type,
      data: req.body?.data
    });

    // Process webhook
    await handleWebhook(req);
  } catch (error) {
    console.error('Webhook error:', error);
    // Don't send error response since we already sent 200 OK
  }
};

// Webhook endpoints
app.post('/api/webhook', webhookHandler);
app.post('/webhook', webhookHandler); // Fallback route

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

// Start local server if not in production
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
    console.log('Bot config:', {
      username: process.env.BOT_USERNAME,
      fid: process.env.BOT_FID,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID
    });
  });
}
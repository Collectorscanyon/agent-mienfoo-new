import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import type { Request, Response } from 'express';

// Initialize Express app
const app = express();

// Raw body logging middleware (before parsing)
app.use((req: Request, res: Response, next) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    console.log('Raw request body:', data);
    try {
      if (data) {
        const parsed = JSON.parse(data);
        console.log('Parsed request body:', parsed);
      }
    } catch (e) {
      console.log('Could not parse request body as JSON');
    }
    next();
  });
});

// Request parsing middleware
app.use(express.json({ 
  limit: '10mb',
  strict: false,
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('Request details:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: req.headers,
    rawBody: (req as any).rawBody?.toString(),
    parsedBody: req.body
  });
  next();
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Bot API is running' });
});

// Webhook handler
const webhookHandler = async (req: Request | VercelRequest, res: Response | VercelResponse) => {
  try {
    // Log incoming webhook details
    console.log('Webhook received:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.url,
      headers: req.headers,
      body: req.body
    });

    // Send immediate acknowledgment
    res.status(200).send('OK');

    // Process webhook if body exists
    if (req.body) {
      await handleWebhook(req.body);
    } else {
      console.warn('Empty webhook body received');
    }
  } catch (error) {
    console.error('Webhook error:', error);
    // Don't send error response since we already sent 200 OK
  }
};

// Register webhook routes
app.post('/api/webhook', webhookHandler);
app.post('/webhook', webhookHandler); // Fallback route for compatibility

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    // Add raw body parsing for Vercel environment
    if (!req.body && req.headers['content-type']?.includes('application/json')) {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          if (data) {
            req.body = JSON.parse(data);
          }
        } catch (e) {
          console.error('Error parsing request body in Vercel handler:', e);
        }
        handleRequest();
      });
    } else {
      handleRequest();
    }

    function handleRequest() {
      app(req, res, (err) => {
        if (err) {
          console.error('Express error:', err);
          reject(err);
        } else {
          resolve(undefined);
        }
      });
    }
  });
}

// Start local server if not in production
if (process.env.NODE_ENV !== 'production') {
  const port = parseInt(process.env.PORT || '5000', 10);
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
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Request logging and parsing middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  let rawBody = '';
  
  req.on('data', chunk => {
    rawBody += chunk;
  });

  req.on('end', () => {
    (req as any).rawBody = rawBody;
    
    console.log('Request received:', {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      headers: req.headers,
      contentType: req.headers['content-type'],
      rawBody: rawBody
    });

    if (rawBody && req.headers['content-type']?.includes('application/json')) {
      try {
        req.body = JSON.parse(rawBody);
        console.log('Parsed JSON body:', req.body);
      } catch (e) {
        console.error('Failed to parse JSON body:', e);
      }
    }
    next();
  });
});

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req: Request, _res: Response, buf: Buffer) => {
    (req as any).rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

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
  const timestamp = new Date().toISOString();
  
  // Send 200 OK immediately to prevent retries
  res.status(200);

  try {
    console.log('Processing webhook request:', {
      timestamp,
      method: req.method,
      path: req.url,
      headers: req.headers,
      contentType: req.headers['content-type'],
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      rawBody: (req as any).rawBody
    });

    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      const error = 'Empty or invalid request body';
      console.warn(error, {
        contentType: req.headers['content-type'],
        rawBody: (req as any).rawBody
      });
      return res.json({
        success: false,
        error,
        message: 'Request body must be valid JSON with type and data fields'
      });
    }

    // Extract and validate webhook data
    const { type, data } = req.body;
    
    console.log('Webhook payload:', {
      timestamp,
      type,
      data: JSON.stringify(data, null, 2)
    });

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
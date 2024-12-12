import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { handleWebhook } from './bot/handlers';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Enhanced request logging middleware (before parsing)
app.use((req: Request, res: Response, next: NextFunction) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    try {
      if (data) {
        const parsed = JSON.parse(data);
        console.log('Incoming request:', {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          headers: req.headers,
          body: parsed
        });
      }
    } catch (e) {
      console.log('Raw request body (non-JSON):', data);
    }
    next();
  });
});

// Enhanced request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  let rawData = '';
  req.setEncoding('utf8');
  
  req.on('data', (chunk) => {
    rawData += chunk;
  });
  
  req.on('end', () => {
    if (rawData) {
      try {
        const parsedData = JSON.parse(rawData);
        (req as any).rawBody = rawData;
        req.body = parsedData;
        console.log('Parsed request body:', {
          path: req.path,
          method: req.method,
          headers: req.headers,
          body: parsedData
        });
      } catch (e) {
        console.error('Error parsing request body:', e);
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
  
  try {
    // Enhanced request logging
    console.log('Webhook received:', {
      timestamp,
      method: req.method,
      path: req.url,
      headers: req.headers,
      body: req.body,
      rawBody: (req as any).rawBody
    });

    // Always send 200 OK immediately to prevent retries
    res.status(200);

    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      console.warn('Empty webhook body received');
      return res.json({
        error: 'Empty request body',
        message: 'Request body cannot be empty'
      });
    }

    // Extract webhook data
    const { type, data } = req.body;
    
    console.log('Processing webhook:', {
      timestamp,
      type,
      data: JSON.stringify(data, null, 2)
    });

    if (type === 'cast.created' && data) {
      // Process webhook asynchronously
      handleWebhook(req.body).catch(err => {
        console.error('Error processing webhook:', err);
      });
      
      // Return success immediately
      return res.json({
        success: true,
        message: 'Webhook accepted for processing',
        timestamp
      });
    }

    // For test requests or unknown types
    return res.json({
      success: true,
      message: 'Webhook received',
      timestamp,
      type,
      dataReceived: !!data
    });

  } catch (error) {
    console.error('Webhook processing error:', {
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });

    // Still return 200 to prevent retries
    res.json({
      error: 'Error processing webhook',
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
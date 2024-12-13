import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import webhookRouter from './routes/webhook';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Verify required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NEYNAR_API_KEY',
  'BOT_USERNAME',
  'BOT_FID',
  'WEBHOOK_SECRET',
  'SIGNER_UUID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('Incoming request:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 
        `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
    },
    body: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'empty'
  });
  next();
});

// Root health check endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    message: 'Bot API is running',
    config: {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasBotConfig: !!process.env.BOT_USERNAME && !!process.env.BOT_FID,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET
    }
  });
});

// Register webhook routes with enhanced logging
console.log('Registering webhook routes...');

// Handle both /api/webhook and /webhook paths
const webhookPaths = ['/api/webhook', '/webhook'];
webhookPaths.forEach(path => {
  app.use(path, webhookRouter);
  console.log(`Webhook route registered at ${path}`, {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });

  // Add explicit POST handler for more detailed logging
  app.post(path, (req: Request, res: Response, next: NextFunction) => {
    console.log(`Webhook POST request received at ${path}:`, {
      timestamp: new Date().toISOString(),
      headers: {
        'content-type': req.headers['content-type'],
        'x-neynar-signature': req.headers['x-neynar-signature'] ? 
          `${(req.headers['x-neynar-signature'] as string).substring(0, 10)}...` : 'missing'
      },
      body: req.body ? JSON.stringify(req.body).substring(0, 200) + '...' : 'empty'
    });
    next();
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', {
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? {
      name: err.name,
      message: err.message,
      stack: err.stack
    } : err,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Vercel serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  return new Promise((resolve, reject) => {
    const expressReq = Object.assign(req, {
      get: (header: string) => req.headers[header],
      header: (header: string) => req.headers[header],
      accepts: () => true,
    });

    const expressRes = Object.assign(res, {
      status: (statusCode: number) => {
        res.status(statusCode);
        return expressRes;
      },
      json: (body: any) => {
        res.json(body);
        return expressRes;
      },
      send: (body: any) => {
        res.send(body);
        return expressRes;
      }
    });

    app(expressReq as any, expressRes as any, (err?: any) => {
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
    const timestamp = new Date().toISOString();
    console.log('Server started successfully:', {
      timestamp,
      port,
      environment: process.env.NODE_ENV,
      config: {
        username: process.env.BOT_USERNAME,
        fid: process.env.BOT_FID,
        hasNeynarKey: !!process.env.NEYNAR_API_KEY,
        hasSignerUuid: !!process.env.SIGNER_UUID,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasWebhookSecret: !!process.env.WEBHOOK_SECRET
      }
    });
  });
}
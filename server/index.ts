import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import crypto from 'crypto';
import webhookRouter from './routes/webhook';

// Initialize environment
dotenv.config();

// Verify required environment variables
const requiredVars = [
  'NEYNAR_API_KEY',
  'OPENAI_API_KEY',
  'BOT_USERNAME',
  'BOT_FID',
  'WEBHOOK_SECRET',
  'SIGNER_UUID'
];

const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Initialize API clients
console.log('Initializing API clients...');
const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced request logging
app.use((req, res, next) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  console.log('Incoming request:', {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    }
  });
  next();
});

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Farcaster Bot API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    config: {
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET
    }
  });
});

// Register webhook routes
console.log('Registering webhook routes...');
app.use('/api/webhook', webhookRouter);

console.log('Webhook route registered at /api/webhook', {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development'
});

// Helper function to find an available port
async function findAvailablePort(startPort: number): Promise<number> {
  const testServer = express();
  
  return new Promise((resolve, reject) => {
    testServer.listen(startPort, '0.0.0.0')
      .on('listening', function() {
        const port = (this.address() as any).port;
        testServer.close(() => resolve(port));
      })
      .on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          findAvailablePort(startPort + 1).then(resolve, reject);
        } else {
          reject(err);
        }
      });
  });
}

// Start server with port conflict handling
async function startServer() {
  try {
    const availablePort = await findAvailablePort(port);
    const server = app.listen(availablePort, '0.0.0.0', () => {
      console.log('Server started successfully:', {
        timestamp: new Date().toISOString(),
        port: availablePort,
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

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', {
        promise,
        reason,
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    console.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    process.exit(1);
  }
}

startServer();
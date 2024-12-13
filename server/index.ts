import express from 'express';
import cors from 'cors';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import webhookRouter from './routes/webhook';
import { logger } from './utils/logger';
import { config } from './config/environment';

const app = express();
const port = 5000; // Explicitly set port for Mienfoo

// Configure middleware with proper limits for Farcaster webhooks
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Request logging middleware for Mienfoo
app.use((req, res, next) => {
  logger.info('Incoming request:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    headers: {
      'content-type': req.headers['content-type'],
      'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
    }
  });
  next();
});

// Initialize API clients
logger.info('Initializing API clients...');

// Initialize Neynar client
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    },
  },
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Farcaster Bot API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET
    }
  });
});

// Register webhook routes
logger.info('Registering webhook routes...');
app.use('/api/webhook', webhookRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  logger.info('Server started successfully:', {
    timestamp: new Date().toISOString(),
    port,
    environment: process.env.NODE_ENV || 'development',
    config: {
      username: config.BOT_USERNAME,
      fid: config.BOT_FID,
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET
    }
  });
});

// Handle cleanup
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});
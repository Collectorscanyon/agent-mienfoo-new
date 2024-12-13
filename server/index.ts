import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import webhookRouter from './routes/webhook';
import { logger } from './utils/logger';

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
logger.info('Initializing API clients...');

// Initialize Neynar client
const neynarConfig = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    },
  },
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
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
logger.info('Registering webhook routes...');
app.use('/api/webhook', webhookRouter);

// Start server with port fallback
const ports = [5000, 5001, 5002, 5003];
let server: ReturnType<typeof app.listen> | null = null;

const startServer = async () => {
  for (const currentPort of ports) {
    try {
      server = await new Promise((resolve, reject) => {
        const srv = app.listen(currentPort, '0.0.0.0', () => {
          logger.info('Server started successfully:', {
            timestamp: new Date().toISOString(),
            port: currentPort,
            environment: process.env.NODE_ENV || 'development',
            config: {
              username: process.env.BOT_USERNAME,
              fid: process.env.BOT_FID,
              hasNeynarKey: !!process.env.NEYNAR_API_KEY,
              hasSignerUuid: !!process.env.SIGNER_UUID,
              hasOpenAIKey: !!process.env.OPENAI_API_KEY,
              hasWebhookSecret: !!process.env.WEBHOOK_SECRET
            }
          });
          resolve(srv);
        });

        srv.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            logger.warn(`Port ${currentPort} is in use, trying next port...`);
            srv.close(() => resolve(null));
          } else {
            reject(error);
          }
        });
      });

      if (server) break;
    } catch (error) {
      logger.error('Error starting server:', {
        port: currentPort,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!server) {
    logger.error('Failed to start server on any available port');
    process.exit(1);
  }
};

// Handle cleanup
const cleanup = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed gracefully');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  cleanup();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  cleanup();
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason,
    timestamp: new Date().toISOString()
  });
});

// Start server with error handling
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
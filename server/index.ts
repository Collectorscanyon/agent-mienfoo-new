import express from 'express';
import cors from 'cors';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import OpenAI from 'openai';
import crypto from 'crypto';
import { config } from './config/environment';

const app = express();
const port = 5000;

// Initialize API clients with proper configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    }
  }
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ 
  apiKey: config.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 10000
});

// Track processed mentions
const processedMentions = new Set<string>();

// Middleware for parsing JSON bodies with raw body access for signature verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  },
  limit: '50kb'
}));

app.use(cors());

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-neynar-signature']
}));

// Body parsing middleware with raw body access for signature verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  },
  limit: '50kb'
}));

// Import debug logging middleware
import { debugLogging } from './middleware/debugLogging';
import webhookRouter from './routes/webhook';

// Add debug logging middleware
app.use(debugLogging);

// Mount webhook router
app.use('/api/webhook', webhookRouter);

// Health check endpoint with logging
app.get('/', (req, res) => {
  console.log('Health check request received:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path
  });
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET
    }
  });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log('Server started successfully:', {
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
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', {
    reason,
    promise,
    timestamp: new Date().toISOString()
  });
});

export default app;

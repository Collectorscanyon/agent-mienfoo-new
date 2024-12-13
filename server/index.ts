import express from 'express';
import cors from 'cors';
import { configureRoutes } from './api/routes';
import { logger } from './utils/logger';
import { config } from './config/environment';

const app = express();
const port = parseInt(config.PORT.toString(), 10);

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced request logging
app.use((req, res, next) => {
  logger.info('Incoming request:', {
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

// Configure routes
logger.info('Registering webhook routes...');
configureRoutes(app);

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

// Start server
app.listen(port, '0.0.0.0', () => {
  logger.info('Server started successfully:', {
    timestamp: new Date().toISOString(),
    port,
    environment: process.env.NODE_ENV,
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
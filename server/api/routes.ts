import express, { Router } from 'express';
import { validateWebhook } from './middleware';
import { handleWebhook } from '../bot/handlers';
import { logger } from '../utils/logger';

export function configureRoutes(app: express.Application) {
  const router = Router();

  // Register webhook route
  router.post('/webhook', validateWebhook, handleWebhook);
  
  // Mount routes
  app.use('/api', router);
  
  logger.info('Webhook route registered at /api/webhook', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
}

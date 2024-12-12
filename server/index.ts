import express, { Request, Response, NextFunction } from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['NEYNAR_API_KEY', 'SIGNER_UUID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Initialize Neynar client
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY || ''
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString()
  });
});

// Webhook endpoint with minimal implementation
app.post('/webhook', (req: Request, res: Response) => {
  // Send immediate 200 OK to prevent timeouts
  res.status(200).send('OK');
  
  // Log webhook data
  console.log('Webhook received:', {
    timestamp: new Date().toISOString(),
    body: req.body
  });
});

// Start server with proper error handling
const PORT = parseInt(process.env.PORT || '5000', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Server running on port ${PORT}`);
  console.log('✅ Ready to handle webhook requests');
}).on('error', (error: Error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

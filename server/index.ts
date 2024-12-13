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
  fid: parseInt(config.BOT_FID || '834885'),
  signerUuid: config.SIGNER_UUID
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

// Import debug logging middleware
import { debugLogging } from './middleware/debugLogging';
import webhookRouter from './routes/webhook';

// Add debug logging middleware
app.use(debugLogging);

// Mount webhook router
app.use('/api/webhook', webhookRouter);

// Verify Neynar webhook signature
function verifySignature(req: express.Request): boolean {
  const signature = req.headers['x-neynar-signature'];
  if (!signature || !config.WEBHOOK_SECRET) return false;

  const hmac = crypto.createHmac('sha256', config.WEBHOOK_SECRET);
  const digest = hmac.update((req as any).rawBody).digest('hex');
  return signature === digest;
}

// Webhook endpoint
app.post('/api/webhook', async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  
  try {
    // Log incoming request
    console.log('Webhook received:', {
      requestId,
      timestamp: new Date().toISOString(),
      headers: {
        'content-type': req.headers['content-type'],
        'x-neynar-signature': req.headers['x-neynar-signature'] ? 'present' : 'missing'
      }
    });

    // Verify webhook signature in production
    if (process.env.NODE_ENV === 'production' && !verifySignature(req)) {
      console.error('Invalid signature:', { requestId });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body;

    // Log webhook data
    console.log('Processing webhook:', {
      requestId,
      type,
      hash: data?.hash,
      text: data?.text,
      author: data?.author?.username
    });

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Check for bot mention
    if (!data.text.toLowerCase().includes('@mienfoo.eth')) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    // Avoid duplicate processing
    if (processedMentions.has(data.hash)) {
      console.log('Skipping duplicate mention:', { requestId, hash: data.hash });
      return res.status(200).json({ status: 'ignored', reason: 'already processed' });
    }

    // Generate response with retries
    let response;
    for (let i = 0; i < 3; i++) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: `You are Mienfoo, a knowledgeable Pokémon card collector bot. 
Your responses should be concise (max 280 chars), friendly, and focus on collecting advice 
and Pokémon card knowledge. Always end your responses with /collectorscanyon`
            },
            { role: "user", content: data.text }
          ],
          max_tokens: 100,
          temperature: 0.7
        });

        response = completion.choices[0].message.content;
        if (!response?.endsWith('/collectorscanyon')) {
          response = `${response} /collectorscanyon`;
        }
        break;
      } catch (error) {
        if (i === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }

    // Post response with retries
    for (let i = 0; i < 3; i++) {
      try {
        await neynar.publishCast(
          config.SIGNER_UUID,
          response!,
          { replyTo: data.hash }
        );
        break;
      } catch (error) {
        if (i === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }

    // Mark as processed
    processedMentions.add(data.hash);

    // Log success
    console.log('Response posted successfully:', {
      requestId,
      hash: data.hash,
      response
    });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing webhook:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
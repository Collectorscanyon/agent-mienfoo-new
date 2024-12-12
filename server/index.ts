import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Environment validation function
function checkEnvironment() {
  const required = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET'] as const;
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    process.exit(1);
  }

  console.log('✓ Environment variables verified:', {
    hasNeynarKey: !!process.env.NEYNAR_API_KEY,
    hasSignerUuid: !!process.env.SIGNER_UUID,
    hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
    port: process.env.PORT || 5000
  });
}

// Run environment check
checkEnvironment();

// Initialize Express and middleware
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client
const neynar = new NeynarAPIClient({ 
  apiKey: process.env.NEYNAR_API_KEY || '',
});

// Log successful initialization
console.log('Neynar client initialized');

// Test cast function
async function testCast() {
  try {
    console.log('Attempting to send test cast...');
    const response = await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: "🎭 Testing Collectors Canyon Bot! #CollectorsWelcome",
      channelId: "collectorscanyon"
    });
    console.log('Test cast successful:', response);
    return response;
  } catch (error) {
    console.error('Test cast failed:', error);
    throw error;
  }
}

// Test endpoint to verify server and configuration
app.get('/test', async (_req, res) => {
  try {
    // First verify configuration
    const config = {
      hasApiKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
      port: process.env.PORT || 5000
    };
    
    // Try to send a test cast
    const castResponse = await testCast();
    
    res.json({
      status: 'ok',
      message: 'Collectors Canyon Bot',
      config,
      testCast: {
        success: true,
        response: castResponse
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Define webhook payload type
interface WebhookPayload {
  type: string;
  cast?: {
    hash: string;
    text: string;
    author: {
      username: string;
      fid: string;
    };
    mentions?: Array<{ fid: string }>;
  };
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  // Send immediate response
  res.status(200).json({ status: 'processing' });
  
  try {
    const payload = req.body as WebhookPayload;
    console.log('Webhook received:', {
      type: payload.type,
      text: payload.cast?.text,
      mentions: payload.cast?.mentions
    });

    // Handle bot mentions
    if (payload.type === 'cast.created' && payload.cast?.mentions?.some(mention => mention.fid === process.env.BOT_FID)) {
      try {
        console.log('Bot mentioned by:', payload.cast.author.username);
        
        // Add like reaction
        await neynar.publishReaction({
          signerUuid: process.env.SIGNER_UUID || '',
          reactionType: 'like',
          target: payload.cast.hash
        });
        
        // Reply in collectors canyon channel
        await neynar.publishCast({
          signerUuid: process.env.SIGNER_UUID || '',
          text: `Hey @${payload.cast.author.username}! 👋 Welcome to Collectors Canyon! Let's talk about your collection! #CollectorsWelcome`,
          channelId: 'collectorscanyon'
        });
        
        console.log('Successfully processed mention');
      } catch (error) {
        console.error('Error processing mention:', error);
      }
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
});

// Start the server
const PORT = parseInt(process.env.PORT || '5000', 10);
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Ready for webhook requests');
}).on('error', (error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server shutting down');
    process.exit(0);
  });
});

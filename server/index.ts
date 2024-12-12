import express from 'express';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';
import { config } from './config';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Neynar client
const neynar = new NeynarAPIClient({ apiKey: config.NEYNAR_API_KEY });

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const { type, cast } = req.body;
    console.log('Received webhook:', { type, cast });

    if (type === 'cast.created' && cast) {
      // Check for bot mentions
      const isMentioned = cast.mentions?.some((m: any) => m.fid === config.BOT_FID);

      if (isMentioned) {
        console.log('Bot mention detected, processing...');
        
        try {
          // Like the mention
          await neynar.reactToCast({
            signer_uuid: config.SIGNER_UUID,
            reaction_type: 'like',
            cast_hash: cast.hash
          });

          // Reply in the collectors channel
          await neynar.publishCast({
            signer_uuid: config.SIGNER_UUID,
            text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles!`,
            parent: cast.hash,
            channel_id: 'collectorscanyon'
          });
          
          console.log('Successfully processed mention');
        } catch (error) {
          console.error('Error processing mention:', error);
        }
      }
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      botFid: config.BOT_FID
    }
  });
});

const PORT = config.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('🎯 Ready for mentions and channel posts');
});

import express from 'express';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { config } from './config';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client with v2 configuration
const neynarConfig = new Configuration({
  apiKey: config.NEYNAR_API_KEY,
});

const neynar = new NeynarAPIClient(neynarConfig);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Webhook handler
app.post('/webhook', async (req, res) => {
  try {
    const { type, cast } = req.body;
    console.log('Webhook received:', {
      type,
      cast: cast ? {
        text: cast.text,
        author: cast.author?.username,
        mentions: cast.mentions
      } : null
    });

    if (type === 'cast.created' && cast) {
      // Check for mentions of our bot
      const isMentioned = cast.mentions?.some((m: any) => m.fid === config.BOT_FID) ||
                         cast.text?.toLowerCase().includes(`@${config.BOT_USERNAME.toLowerCase()}`);

      if (isMentioned) {
        console.log('Processing mention from:', cast.author.username);

        try {
          // Add like reaction
          await neynar.reactToCast({
            signer_uuid: config.SIGNER_UUID,
            reaction_type: 'like',
            cast_hash: cast.hash
          });
          console.log('Added like reaction');

          // Reply to the mention
          await neynar.publishCast({
            signer_uuid: config.SIGNER_UUID,
            text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles! #CollectorsCanyonClub`,
            parent: cast.hash,
            channel_id: 'collectorscanyon'
          });
          console.log('Published reply in collectors canyon');
        } catch (error) {
          console.error('Error processing mention:', error);
        }
      }
    }

    res.status(200).json({ status: 'success' });
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
      botFid: config.BOT_FID,
      botUsername: config.BOT_USERNAME,
      channelId: 'collectorscanyon'
    }
  });
});

const PORT = config.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('🎯 Ready for mentions and channel posts');
  console.log('ℹ️ Bot info:', {
    username: config.BOT_USERNAME,
    fid: config.BOT_FID,
    channel: 'collectorscanyon'
  });
});

import express from 'express';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Neynar client
const neynar = new NeynarAPIClient({ apiKey: process.env.NEYNAR_API_KEY || '' });

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
    console.log('Webhook received:', { type, cast });

    if (type === 'cast.created') {
      // Check for mentions of our bot
      if (cast.mentions?.some((m: any) => m.fid === process.env.BOT_FID)) {
        await handleMention(cast);
      }

      // Check if cast should be shared to collectors channel
      if (isCollectibleRelated(cast.text)) {
        await postToCollectorsCanyon(cast);
      }
    }

    res.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleMention(cast: any) {
  try {
    // Like the mention
    await neynar.publishReaction({
      signerUuid: process.env.SIGNER_UUID || '',
      reactionType: 'like',
      castHash: cast.hash
    });

    // Reply to mention
    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID || '',
      text: `Hey @${cast.author.username}! 👋 Let's talk about collectibles!`,
      parent: cast.hash,
      channelId: 'collectorscanyon'
    });

    console.log('Successfully processed mention from:', cast.author.username);
  } catch (error) {
    console.error('Error handling mention:', error);
  }
}

async function postToCollectorsCanyon(cast: any) {
  try {
    await neynar.publishCast({
      signer_uuid: process.env.SIGNER_UUID || '',
      text: `💡 Interesting collection discussion from @${cast.author.username}:\n\n${cast.text}\n\n#CollectorsCanyonClub`,
      parent_url: 'https://warpcast.com/~/channel/collectorscanyon'
    });
    console.log('Successfully shared to CollectorsCanyon');
  } catch (error) {
    console.error('Error posting to channel:', error);
  }
}

function isCollectibleRelated(text: string): boolean {
  const keywords = ['collect', 'card', 'rare', 'trading', 'pokemon', 'magic'];
  return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      botFid: process.env.BOT_FID
    }
  });
});

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Listening for mentions and channel posts');
});

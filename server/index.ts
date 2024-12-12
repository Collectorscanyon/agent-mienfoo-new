import express from 'express';
import { handleWebhook } from './bot/handlers';
import { config } from './config';

const app = express();
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req.body);
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      botFid: config.BOT_FID || '834885'
    }
  });
});

const PORT = config.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 Bot server running on port ${PORT}`);
  console.log('👂 Listening for mentions and channel posts');
});
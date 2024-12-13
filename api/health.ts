import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from './config';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = process.hrtime();
  const memory = process.memoryUsage();

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    },
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasSignerUuid: !!config.SIGNER_UUID,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET,
      botConfig: {
        username: config.BOT_USERNAME,
        fid: config.BOT_FID
      }
    }
  });
}

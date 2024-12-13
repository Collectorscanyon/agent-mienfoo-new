import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  // Enhanced deployment info
  const deploymentInfo = {
    vercel: {
      environment: process.env.VERCEL_ENV || 'development',
      region: process.env.VERCEL_REGION || 'local',
      deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
    }
  };

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    deployment: deploymentInfo,
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    },
    config: {
      hasNeynarKey: !!process.env.NEYNAR_API_KEY,
      hasSignerUuid: !!process.env.SIGNER_UUID,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
      botConfig: {
        username: process.env.BOT_USERNAME,
        fid: process.env.BOT_FID
      }
    }
  });
}

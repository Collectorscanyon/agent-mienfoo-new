import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from './config';

// Simple root endpoint handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const memory = process.memoryUsage();
  
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    memory: {
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
    },
    config: {
      hasNeynarKey: !!config.NEYNAR_API_KEY,
      hasOpenAIKey: !!config.OPENAI_API_KEY,
      hasWebhookSecret: !!config.WEBHOOK_SECRET,
      botConfig: {
        username: config.BOT_USERNAME,
        fid: config.BOT_FID
      }
    }
  });
}


//This section was added to address the intention of adding error handling and environment variable validation.
//It also incorporates a placeholder for the missing config file.  A robust error handling system is essential for production deployments.
function validateEnvironmentVariables() {
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'NEYNAR_API_KEY',
      'BOT_USERNAME',
      'BOT_FID',
      'WEBHOOK_SECRET',
      'SIGNER_UUID'
    ];
  
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
  }
  
  try {
    validateEnvironmentVariables();
  } catch (error) {
    console.error("Error validating environment variables:", error);
    //Handle the error appropriately, perhaps by exiting the process or returning an error response.
    process.exit(1); 
  }


//Placeholder for the config file.  This should be a separate file named 'config.ts' or similar.
//This example uses a simplified structure for demonstration purposes.
//A real-world implementation may involve more complex configuration and possibly environment-specific settings.

// config.ts
// export const config = {
//   NODE_ENV: process.env.NODE_ENV || 'development',
//   OPENAI_API_KEY: process.env.OPENAI_API_KEY,
//   NEYNAR_API_KEY: process.env.NEYNAR_API_KEY,
//   BOT_USERNAME: process.env.BOT_USERNAME,
//   BOT_FID: process.env.BOT_FID,
//   WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
//   SIGNER_UUID: process.env.SIGNER_UUID
// };
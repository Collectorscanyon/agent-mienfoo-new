import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  NEYNAR_API_KEY: string;
  OPENAI_API_KEY: string;
  SIGNER_UUID: string;
  WEBHOOK_SECRET: string;
  PORT: number;
  BOT_USERNAME: string;
  BOT_FID: string;
}

const createConfig = (): Config => {
  const config = {
    NEYNAR_API_KEY: process.env.NEYNAR_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    SIGNER_UUID: process.env.SIGNER_UUID || '',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
    BOT_USERNAME: process.env.BOT_USERNAME || 'mienfoo',
    BOT_FID: process.env.BOT_FID || '834885'
  };

  // Check required fields
  const required = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'OPENAI_API_KEY'];
  const missing = required.filter(key => !config[key as keyof Config]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  return config;
};

export const config = createConfig();
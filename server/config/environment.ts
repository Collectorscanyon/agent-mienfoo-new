import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NEYNAR_API_KEY',
  'BOT_USERNAME',
  'BOT_FID',
  'WEBHOOK_SECRET',
  'SIGNER_UUID'
] as const;

// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Export validated configuration
export const config = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY!,
  BOT_USERNAME: process.env.BOT_USERNAME!,
  BOT_FID: process.env.BOT_FID!,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
  SIGNER_UUID: process.env.SIGNER_UUID!
} as const;

// Export type for environment configuration
export type Config = typeof config;

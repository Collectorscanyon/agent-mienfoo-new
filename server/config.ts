import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  NEYNAR_API_KEY: string;
  SIGNER_UUID: string;
  WEBHOOK_SECRET: string;
  PORT: number;
  BOT_USERNAME: string;
  BOT_FID: string;
}

function validateEnvVar(name: string, value: string | undefined, defaultValue?: string): string {
  if (!value && !defaultValue) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value || defaultValue || '';
}

function createConfig(): Config {
  const config: Config = {
    NEYNAR_API_KEY: validateEnvVar('NEYNAR_API_KEY', process.env.NEYNAR_API_KEY),
    SIGNER_UUID: validateEnvVar('SIGNER_UUID', process.env.SIGNER_UUID),
    WEBHOOK_SECRET: validateEnvVar('WEBHOOK_SECRET', process.env.WEBHOOK_SECRET, 'default_secret'),
    PORT: parseInt(validateEnvVar('PORT', process.env.PORT, '5000'), 10),
    BOT_USERNAME: validateEnvVar('BOT_USERNAME', process.env.BOT_USERNAME, 'mienfoo'),
    BOT_FID: validateEnvVar('BOT_FID', process.env.BOT_FID, '834885')
  };

  return config;
}

export const config = createConfig();
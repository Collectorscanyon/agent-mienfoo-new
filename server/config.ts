export interface Config {
  NEYNAR_API_KEY: string;
  OPENAI_API_KEY: string;
  SIGNER_UUID: string;
  WEBHOOK_SECRET: string;
  PORT: number;
  BOT_USERNAME: string;
  BOT_FID: string;
}

// Type-safe config object with validation
const validateConfig = () => {
  const required = {
    NEYNAR_API_KEY: 'Neynar API key for Farcaster interactions',
    SIGNER_UUID: 'Signer UUID for Farcaster bot identity',
    WEBHOOK_SECRET: 'Secret for verifying webhook calls',
    OPENAI_API_KEY: 'OpenAI API key for bot responses'
  };

  const missing = Object.entries(required)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `${key} (${desc})`);
  
  if (missing.length > 0) {
    console.error('Configuration Error:', `Missing required environment variables:\n${missing.join('\n')}`);
    process.exit(1);
  }
};

// Validate on initialization
validateConfig();

export const config: Config = {
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  SIGNER_UUID: process.env.SIGNER_UUID!,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
  BOT_USERNAME: process.env.BOT_USERNAME || 'mienfoo',
  BOT_FID: process.env.BOT_FID || ''
};

// Export individual config values with proper types
export const {
  NEYNAR_API_KEY,
  OPENAI_API_KEY,
  PORT,
  SIGNER_UUID,
  WEBHOOK_SECRET,
  BOT_USERNAME,
  BOT_FID
} = config;

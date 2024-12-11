// Type-safe config object with validation
const validateConfig = () => {
  const required = ['NEYNAR_API_KEY', 'SIGNER_UUID', 'WEBHOOK_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Validate on initialization
validateConfig();

export const config = {
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY!,
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  SIGNER_UUID: process.env.SIGNER_UUID!,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
  BOT_USERNAME: process.env.BOT_USERNAME || 'mienfoo',
  BOT_FID: process.env.BOT_FID || ''
} as const;

// Export individual config values with proper types
export const {
  NEYNAR_API_KEY,
  PORT,
  SIGNER_UUID,
  WEBHOOK_SECRET,
  BOT_USERNAME,
  BOT_FID
} = config;

// Type-safe config object
export const config = {
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY || '',
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  SIGNER_UUID: process.env.SIGNER_UUID || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || ''
} as const;

// Exported variables with proper types
export const NEYNAR_API_KEY: string = config.NEYNAR_API_KEY;
export const PORT: number = config.PORT;
export const SIGNER_UUID: string = config.SIGNER_UUID;
export const WEBHOOK_SECRET: string = config.WEBHOOK_SECRET;

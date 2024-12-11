export const config = {
  NEYNAR_API_KEY: process.env.NEYNAR_API_KEY || '',
  PORT: process.env.PORT || 5000,
  SIGNER_UUID: process.env.SIGNER_UUID || '',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || ''
};

export const { NEYNAR_API_KEY, PORT, SIGNER_UUID, WEBHOOK_SECRET } = config;

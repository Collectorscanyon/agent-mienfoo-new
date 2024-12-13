import { z } from 'zod';

// Environment validation schema with detailed error messages
const envSchema = z.object({
  NEYNAR_API_KEY: z.string().min(1, 'NEYNAR_API_KEY is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
  SIGNER_UUID: z.string().min(1, 'SIGNER_UUID is required'),
  BOT_USERNAME: z.string().default('mienfoo.eth'),
  BOT_FID: z.string().default('834885'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
});

// Validate environment variables with error handling
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    throw new Error('Missing required environment variables');
  }
}

const env = validateEnv();

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  baseUrl: env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:3000',
  environment: env.VERCEL_ENV || env.NODE_ENV || 'development'
};

// Webhook event schema with validation
export const webhookSchema = z.object({
  type: z.literal('cast.created'),
  data: z.object({
    hash: z.string(),
    text: z.string(),
    author: z.object({
      username: z.string(),
      fid: z.string()
    }),
    mentioned_profiles: z.array(z.object({
      username: z.string(),
      fid: z.string()
    })),
    thread_hash: z.string().optional(),
    parent_hash: z.string().nullable()
  })
});

export type WebhookEvent = z.infer<typeof webhookSchema>;

// Export specific configurations for different environments
export const webhookConfig = {
  maxBodySize: '50kb',
  timeoutMs: 10000,
  retryAttempts: 3
};

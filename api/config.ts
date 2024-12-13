import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  NEYNAR_API_KEY: z.string(),
  OPENAI_API_KEY: z.string(),
  WEBHOOK_SECRET: z.string(),
  SIGNER_UUID: z.string(),
  BOT_USERNAME: z.string().default('mienfoo.eth'),
  BOT_FID: z.string().default('834885'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

// Validate environment variables
const env = envSchema.parse(process.env);

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production'
};

// Webhook event schema
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
    }))
  })
});

export type WebhookEvent = z.infer<typeof webhookSchema>;

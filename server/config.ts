import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Define config schema with Zod for runtime type checking
const configSchema = z.object({
  NEYNAR_API_KEY: z.string().min(1, "Neynar API key is required"),
  SIGNER_UUID: z.string().min(1, "Signer UUID is required"),
  WEBHOOK_SECRET: z.string().min(1, "Webhook secret is required"),
  PORT: z.number().default(5000),
  BOT_USERNAME: z.string().default('mienfoo'),
  BOT_FID: z.string().default('834885'),
  OPENAI_API_KEY: z.string().min(1, "OpenAI API key is required"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1, "Google Vision credentials are required").default('./temporal-trees-444519-p3-76a66e099c80.json')
});

export type Config = z.infer<typeof configSchema>;

function validateConfig(env: NodeJS.ProcessEnv): Config {
  try {
    return configSchema.parse({
      NEYNAR_API_KEY: env.NEYNAR_API_KEY,
      SIGNER_UUID: env.SIGNER_UUID,
      WEBHOOK_SECRET: env.WEBHOOK_SECRET,
      PORT: env.PORT ? parseInt(env.PORT, 10) : 5000,
      BOT_USERNAME: env.BOT_USERNAME || 'mienfoo',
      BOT_FID: env.BOT_FID || '834885',
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      GOOGLE_VISION_CREDENTIALS: env.GOOGLE_VISION_CREDENTIALS || './temporal-trees-444519-p3-76a66e099c80.json'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:', JSON.stringify(error.errors, null, 2));
    } else {
      console.error('Unexpected configuration error:', error);
    }
    process.exit(1);
  }
}

export const config = validateConfig(process.env);
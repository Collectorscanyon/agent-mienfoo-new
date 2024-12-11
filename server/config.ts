import { z } from 'zod';

const envSchema = z.object({
  NEYNAR_API_KEY: z.string().min(1, "NEYNAR_API_KEY is required"),
  SIGNER_UUID: z.string().min(1, "SIGNER_UUID is required"),
  WEBHOOK_SECRET: z.string().min(1, "WEBHOOK_SECRET is required"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.string().default("5000"),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  
  return parsed.data;
}

export const config = validateEnv();

// Export typed versions of env vars
export const {
  NEYNAR_API_KEY,
  SIGNER_UUID,
  WEBHOOK_SECRET,
  NODE_ENV,
  PORT
} = config;

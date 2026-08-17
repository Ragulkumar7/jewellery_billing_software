import "dotenv/config";
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  SHOPIFY_STORE_DOMAIN: z.string().min(1).optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().min(1).optional(),
  SHOPIFY_API_VERSION: z.string().regex(/^\d{4}-\d{2}$/).default("2026-07"),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(1).optional(),
  SHOPIFY_LOCATION_ID: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/).optional(),
  PUBLIC_API_URL: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);

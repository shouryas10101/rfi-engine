import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),

  // LLM
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "r2"]).default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("./uploads"),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default(""),

  // Misc
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  PUBLIC_FRONTEND_URL: z.string().default("http://localhost:5173"),
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

if (env.STORAGE_PROVIDER === "r2") {
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter(
    (k) => !env[k as keyof typeof env],
  );
  if (missing.length > 0) {
    console.error(`STORAGE_PROVIDER=r2 but missing: ${missing.join(", ")}`);
    process.exit(1);
  }
}

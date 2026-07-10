import { z } from "zod";

/**
 * Environment configuration for FamilyArchive (PRD §30.3).
 *
 * Only variables needed by Milestone 1 are required. SMTP, storage, AI provider,
 * public-indexing, and audit-retention variables are declared optional here so the
 * schema is the single documented source of truth, and become required/used as
 * their milestones land.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Core (required in M1)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // Storage (local driver is the default, PRD §24)
  MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_PATH: z.string().default("/data/media"),
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(500),
  // Instance-wide cap on media storage (originals + generated previews).
  // 0/unset = unlimited. Export bundles never count against it.
  MEDIA_QUOTA_MB: z.coerce.number().int().min(0).default(0),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),

  // SMTP (used from Milestone 2; invites still work without it, PRD §9.3)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  // OCR (PRD §18.3): Tesseract language codes, "+"-separated (e.g. "eng+deu").
  OCR_LANGUAGES: z.string().default("eng"),

  // Audit log retention in days (PRD §22.3); 0/unset keeps entries forever.
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

  // Bearer token for the machine-readable /api/admin/usage endpoint; the
  // endpoint is disabled entirely when unset.
  METRICS_TOKEN: z.string().min(16).optional(),

  // External AI providers (disabled by default, PRD §31.4; explicit admin opt-in)
  AI_PROVIDER: z.enum(["openai", "anthropic"]).optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Parse and cache environment configuration. Throws with a readable message when
 * required variables are missing or invalid. Called lazily so importing modules
 * (e.g. during `next build`) does not require a full runtime environment.
 */
export function getEnv(): Env {
  if (!cached) {
    // Empty strings count as unset: compose files render absent vars as "".
    const provided = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== ""),
    );
    const result = envSchema.safeParse(provided);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${details}`);
    }
    cached = result.data;
  }
  return cached;
}

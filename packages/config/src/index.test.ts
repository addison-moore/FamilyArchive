import { afterEach, describe, expect, it, vi } from "vitest";

const REQUIRED = {
  DATABASE_URL: "postgres://familyarchive:familyarchive@localhost:5432/familyarchive",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

const ORIGINAL_ENV = process.env;

/** getEnv caches its parse, so each case needs a fresh module instance. */
async function loadEnv(vars: Record<string, string>) {
  process.env = { ...vars } as NodeJS.ProcessEnv;
  vi.resetModules();
  const { getEnv } = await import("./index");
  return getEnv;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("getEnv", () => {
  it("applies defaults and coerces numeric values", async () => {
    const getEnv = await loadEnv({ ...REQUIRED, MEDIA_MAX_UPLOAD_MB: "250" });
    const env = getEnv();
    expect(env.MEDIA_STORAGE_DRIVER).toBe("local");
    expect(env.MEDIA_QUOTA_MB).toBe(0);
    expect(env.MEDIA_MAX_UPLOAD_MB).toBe(250);
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it('treats empty strings as unset (compose renders absent vars as "")', async () => {
    const getEnv = await loadEnv({ ...REQUIRED, S3_ENDPOINT: "", OCR_LANGUAGES: "" });
    const env = getEnv();
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.OCR_LANGUAGES).toBe("eng");
  });

  it("throws a readable error naming the missing required variable", async () => {
    const getEnv = await loadEnv({ DATABASE_URL: REQUIRED.DATABASE_URL });
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it("names invalid enum and too-short token values", async () => {
    const badEnum = await loadEnv({ ...REQUIRED, S3_FORCE_PATH_STYLE: "yes" });
    expect(() => badEnum()).toThrow(/S3_FORCE_PATH_STYLE/);

    const shortToken = await loadEnv({ ...REQUIRED, METRICS_TOKEN: "short" });
    expect(() => shortToken()).toThrow(/METRICS_TOKEN/);
  });
});

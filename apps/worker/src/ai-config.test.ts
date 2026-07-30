import { afterEach, describe, expect, it, vi } from "vitest";

const REQUIRED = {
  DATABASE_URL: "postgres://familyarchive:familyarchive@localhost:5432/familyarchive",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

const ORIGINAL_ENV = process.env;

/** getEnv caches, so each case needs fresh modules and a fresh env. */
async function loadAiConfig(vars: Record<string, string>) {
  process.env = { ...REQUIRED, ...vars } as NodeJS.ProcessEnv;
  vi.resetModules();
  const { aiConfig } = await import("./ai-config");
  return aiConfig;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("aiConfig — external AI disabled by default", () => {
  it("is null with no provider configured", async () => {
    const aiConfig = await loadAiConfig({});
    expect(aiConfig()).toBeNull();
  });

  it("is null when the provider lacks an API key", async () => {
    const aiConfig = await loadAiConfig({ AI_PROVIDER: "anthropic" });
    expect(aiConfig()).toBeNull();
  });

  it("supplies a per-provider default model", async () => {
    const anthropic = await loadAiConfig({ AI_PROVIDER: "anthropic", AI_API_KEY: "k" });
    expect(anthropic()).toEqual({
      provider: "anthropic",
      apiKey: "k",
      model: "claude-haiku-4-5-20251001",
    });

    const openai = await loadAiConfig({ AI_PROVIDER: "openai", AI_API_KEY: "k" });
    expect(openai()).toEqual({ provider: "openai", apiKey: "k", model: "gpt-4o-mini" });
  });

  it("prefers an explicit AI_MODEL", async () => {
    const aiConfig = await loadAiConfig({
      AI_PROVIDER: "anthropic",
      AI_API_KEY: "k",
      AI_MODEL: "claude-sonnet-5",
    });
    expect(aiConfig()?.model).toBe("claude-sonnet-5");
  });
});

import { getEnv } from "@familyarchive/config";

export interface AiConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
}

/** Present only when the admin explicitly configured a provider (PRD §31.4). */
export function aiConfig(): AiConfig | null {
  const env = getEnv();
  if (!env.AI_PROVIDER || !env.AI_API_KEY) return null;
  const model =
    env.AI_MODEL ?? (env.AI_PROVIDER === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");
  return { provider: env.AI_PROVIDER, apiKey: env.AI_API_KEY, model };
}

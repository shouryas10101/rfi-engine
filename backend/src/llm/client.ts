import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export type LlmCallOpts = {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export async function callLlm(opts: LlmCallOpts): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const resp = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      response_format: opts.json ? { type: "json_object" } : undefined,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 400,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    return resp.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.error({ err }, "LLM call failed");
    return null;
  }
}

export function llmAvailable(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

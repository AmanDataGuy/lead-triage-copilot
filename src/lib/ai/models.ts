/**
 * # models.ts - which AI models we call, in the order we try them
 *
 * - Primary: Google Gemini Flash-Lite (free tier, fast, enforces our JSON schema).
 * - Fallback: Groq gpt-oss-120b (free tier, strict JSON schema), used only when Gemini fails or is out of quota.
 * - Provider instances are passed directly, never a "provider/model" string: a bare string would route through
 *   the paid Vercel AI Gateway.
 */
import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { generateText, LanguageModel } from "ai";

type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];
export type NamedModel = { id: string; model: LanguageModel; providerOptions?: ProviderOptions };

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

export const PRIMARY_ID = "gemini-3.5-flash-lite";
export const FALLBACK_ID = "openai/gpt-oss-120b";

export const defaultModels: NamedModel[] = [
  {
    id: PRIMARY_ID,
    model: google(PRIMARY_ID),
    // Low thinking keeps answers fast; this task is careful reading, not puzzle solving.
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  },
  {
    id: FALLBACK_ID,
    model: groq(FALLBACK_ID),
    providerOptions: { groq: { structuredOutputs: true, strictJsonSchema: true, reasoningEffort: "low" } },
  },
];

type ModelV4 = Extract<LanguageModel, { specificationVersion: "v4" }>;

// One model that streams from the first provider that accepts the request. Quota and outage errors arrive
// before any text is streamed, so switching here is invisible to the user.
export function firstAvailable(models: NamedModel[]): ModelV4 {
  const list = models.map((m) => m.model as ModelV4);
  return {
    specificationVersion: "v4",
    provider: "fallback",
    modelId: models.map((m) => m.id).join(" > "),
    supportedUrls: {},
    async doGenerate(options) {
      let lastError: unknown;
      for (const m of list) {
        try {
          return await m.doGenerate(options);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
    async doStream(options) {
      let lastError: unknown;
      for (const m of list) {
        try {
          return await m.doStream(options);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}

// Provider settings for every model in the list, merged; each provider only reads its own key.
export const allProviderOptions = Object.assign({}, ...defaultModels.map((m) => m.providerOptions)) as ProviderOptions;

/**
 * Minimal OpenRouter client: one chat completion that should answer in JSON.
 * Kept free of Next.js imports so tests can inject `fetchImpl`.
 */
import { MAX_OUTPUT_TOKENS } from "./models.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25_000;

export type ChatResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  /** USD reported by OpenRouter for this call, or null if it didn't say. */
  costUsd: number | null;
};

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export async function chatJson(options: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema?: object;
  /** Answer length cap; defaults to MAX_OUTPUT_TOKENS. */
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<ChatResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        // Shown in OpenRouter's app rankings; harmless metadata.
        "HTTP-Referer": "https://pitwise.hoodguard.workers.dev",
        "X-Title": "Zolva",
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        temperature: 0.2,
        max_tokens: options.maxTokens ?? MAX_OUTPUT_TOKENS,
        // Hidden thinking counts against max_tokens and can eat the whole
        // answer (seen with Claude Haiku 5.5); these short JSON tasks don't need it.
        reasoning: { enabled: false },
        ...(options.schema ? { response_format: { type: "json_schema", json_schema: { name: "review", strict: true, schema: options.schema } } } : {}),
        // Ask OpenRouter to report the real cost of this call.
        usage: { include: true },
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new OpenRouterError(body?.error?.message ?? `OpenRouter ${response.status}`, response.status);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new OpenRouterError("OpenRouter returned no answer", response.status);
    return {
      content,
      inputTokens: Number(body?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(body?.usage?.completion_tokens ?? 0),
      costUsd: typeof body?.usage?.cost === "number" ? body.usage.cost : null,
    };
  } catch (cause) {
    if (cause instanceof OpenRouterError) throw cause;
    throw new OpenRouterError(controller.signal.aborted ? "OpenRouter timed out" : cause instanceof Error ? cause.message : String(cause), null);
  } finally {
    clearTimeout(timer);
  }
}

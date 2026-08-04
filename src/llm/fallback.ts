import { complete } from "./client";
import type { CompletionRequest, CompletionResponse, ProviderError } from "./types";
import { loadLlmConfig } from "./config";

export type FallbackResult =
  | { ok: true; response: CompletionResponse }
  | { ok: false; errors: ProviderError[] };

export async function completeWithFallback(
  req: CompletionRequest,
  candidateModels: string[] = [],
): Promise<FallbackResult> {
  const cfg = loadLlmConfig();
  const errors: ProviderError[] = [];

  const orderedProviders = [...cfg.providers].sort((a, b) => {
    const priority: Record<string, number> = { deepseek: 0, openai: 1, anthropic: 2, openrouter: 3 };
    return (priority[a.id] ?? 99) - (priority[b.id] ?? 99);
  });

  for (const provider of orderedProviders) {
    if (!provider.apiKey) continue;

    const model = pickModel(provider, req.model, candidateModels);
    if (!model) continue;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await complete({
        ...req,
        model,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return { ok: true, response };
    } catch (err) {
      clearTimeout(timeout);
      const providerErr: ProviderError = {
        type: err instanceof Error && err.name === "AbortError" ? "timeout" : "unknown",
        message: err instanceof Error ? err.message : String(err),
        provider: provider.id,
        retryable: err instanceof Error && err.name !== "AbortError",
      };

      if (err instanceof Object && "status" in (err as object)) {
        const status = (err as { status: number }).status;
        if (status === 429) {
          providerErr.type = "rate_limit";
          providerErr.retryable = true;
        } else if (status === 401) {
          providerErr.type = "auth";
          providerErr.retryable = false;
        } else if (status >= 500) {
          providerErr.type = "server_error";
          providerErr.retryable = true;
        }
      }

      errors.push(providerErr);

      if (!providerErr.retryable) {
        return { ok: false, errors };
      }
    }
  }

  return { ok: false, errors };
}

/**
 * Picks the best model to use for a given provider when falling back:
 * 1. The originally requested model, if the provider serves it.
 * 2. A matching candidate model the caller offered (e.g. routing tiers).
 * 3. The provider's first configured model, as a last resort.
 */
function pickModel(
  provider: { models: string[] },
  requested: string,
  candidates: string[],
): string | null {
  if (provider.models.includes(requested)) return requested;
  for (const c of candidates) {
    if (provider.models.includes(c)) return c;
  }
  return provider.models[0] ?? null;
}

export function formatFallbackErrors(errors: ProviderError[]): string {
  if (errors.length === 0) return "No providers configured.";

  const lines = errors.map(
    (e) => `  [${e.provider}] ${e.type}: ${e.message}`,
  );
  return `All providers failed:\n${lines.join("\n")}`;
}

import { isNvidiaConfigured, messageText, modelChain, nvidiaChatWithFallback, thinkingOff } from '@/lib/ai/nvidia';

/**
 * Text LLM through the NVIDIA key pool. Returns null when no key works, so callers fall back to
 * deterministic text instead of failing the request.
 */
export interface LlmResult {
  text: string;
  provider: string;
  model: string;
}

export const DEFAULT_NVIDIA_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
export const TEXT_MODEL_CHAIN = () =>
  modelChain(process.env.NVIDIA_TEXT_MODEL, process.env.NVIDIA_TEXT_MODELS, [
    DEFAULT_NVIDIA_MODEL,
    'nvidia/nemotron-3-super-120b-a12b',
  ]);

export function isLlmConfigured(): boolean {
  return isNvidiaConfigured();
}

export async function completeText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<LlmResult | null> {
  if (!isNvidiaConfigured()) return null;
  try {
    const { data, model } = await nvidiaChatWithFallback(
      TEXT_MODEL_CHAIN(),
      (model) => ({
        model,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        ...thinkingOff(model),
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
      { timeoutMs: 40_000, maxAttempts: 4 }
    );
    const text = messageText(data);
    return text ? { text, provider: 'nvidia', model } : null;
  } catch (e) {
    console.warn('[llm] NVIDIA text call failed, using rule-based text:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Keep LLM output safe for our renderer: no HTML, no code fences (those are reserved for the
 * app's own `risk` / `metrics` / `compare` blocks), no images, bounded length.
 */
export function sanitizeLlmMarkdown(md: string, maxChars = 2500): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#{1,6}\s.*$/gm, '') // headings are added by the template, not the model
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);
}

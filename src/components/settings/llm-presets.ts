export type CustomApiMode = "chat_completions" | "responses" | "anthropic_messages"

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "custom"
  | "minimax"
  | "claude-code"
  | "codex-cli"

export interface LlmPreset {
  id: string
  label: string
  hint?: string
  provider: Provider
  baseUrl?: string
  baseUrlByMode?: Partial<Record<CustomApiMode, string>>
  defaultModel?: string
  suggestedModels?: string[]
  apiMode?: CustomApiMode
  suggestedContextSize?: number
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "custom",
    label: "自定义模型",
    hint: "任意 OpenAI 或 Anthropic 兼容接口",
    provider: "custom",
    apiMode: "chat_completions",
  },
]

export function matchPreset(params: {
  provider: Provider
  customEndpoint: string
  ollamaUrl: string
  apiMode?: CustomApiMode
}): LlmPreset | null {
  if (params.provider !== "custom") return null
  return LLM_PRESETS[0] ?? null
}

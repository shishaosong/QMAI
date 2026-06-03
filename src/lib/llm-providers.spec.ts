import { describe, expect, it } from "vitest"
import { getProviderConfig } from "./llm-providers"
import type { LlmConfig, ReasoningMode } from "@/stores/wiki-store"

function customConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    provider: "custom",
    apiKey: "sk-test",
    model: "gpt-5.4",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "https://example.test/v1",
    maxContextSize: 204800,
    apiMode: "chat_completions",
    reasoning: { mode: "auto" },
    ...overrides,
  }
}

function requestBody(config: LlmConfig): Record<string, unknown> {
  return getProviderConfig(config).buildBody([
    { role: "user", content: "请回答。" },
  ]) as Record<string, unknown>
}

describe("llm provider reasoning options", () => {
  it("sends reasoning_effort for explicit custom OpenAI-compatible reasoning mode", () => {
    const body = requestBody(customConfig({ reasoning: { mode: "high" } }))

    expect(body.reasoning_effort).toBe("high")
  })

  it("enables Qwen3 thinking when explicit reasoning is enabled", () => {
    const body = requestBody(customConfig({
      model: "qwen3-235b-a22b",
      reasoning: { mode: "high" },
    }))

    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true })
    expect(body.reasoning_effort).toBe("high")
  })

  it("keeps Qwen3 thinking disabled when reasoning is off", () => {
    const body = requestBody(customConfig({
      model: "qwen3-235b-a22b",
      reasoning: { mode: "off" },
    }))

    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(body).not.toHaveProperty("reasoning_effort")
  })

  it.each<ReasoningMode>(["max", "custom"])("maps Responses API %s reasoning to high effort", (mode) => {
    const body = requestBody(customConfig({
      apiMode: "responses",
      customEndpoint: "https://example.test/v1",
      reasoning: mode === "custom" ? { mode, budgetTokens: 12000 } : { mode },
    }))

    expect(body.reasoning).toEqual({ effort: "high" })
  })
})

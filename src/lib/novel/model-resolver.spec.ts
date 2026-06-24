import { describe, expect, it } from "vitest"
import { DEFAULT_NOVEL_CONFIG, useWikiStore, type LlmConfig, type ProviderConfigs } from "@/stores/wiki-store"
import { resolveKnownModelConfig, resolveNovelModel } from "./model-resolver"

const baseConfig: LlmConfig = {
  provider: "custom",
  apiKey: "sk-test",
  model: "mimo-v2.5-pro",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "https://token-plan-cn.xiaomimimo.com/v1",
  maxContextSize: 1_000_000,
  apiMode: "chat_completions",
  reasoning: { mode: "off" },
}

const customConfigs: ProviderConfigs = {
  "custom-1": {
    label: "MiMo gateway",
    apiKey: "sk-test",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    apiMode: "chat_completions",
    model: "",
    enabled: true,
    maxContextSize: 1_000_000,
    reasoning: { mode: "off" },
    savedModels: [
      {
        id: "mimo",
        name: "mimo-v2.5-pro",
        model: "mimo-v2.5-pro",
        createdAt: 1,
      },
    ],
  },
}

describe("novel model resolver", () => {
  it("resolves custom provider-card model refs to their endpoint config", () => {
    const resolved = resolveKnownModelConfig("custom-1/mimo-v2.5-pro", baseConfig, customConfigs)

    expect(resolved?.provider).toBe("custom")
    expect(resolved?.model).toBe("mimo-v2.5-pro")
    expect(resolved?.customEndpoint).toBe("https://token-plan-cn.xiaomimimo.com/v1")
    expect(resolved?.apiMode).toBe("chat_completions")
  })

  it("falls back from a stale chat model ref to a valid writing model", () => {
    useWikiStore.setState({
      aiChatModel: "codex-cli/gpt-5.5",
      providerConfigs: {
        ...customConfigs,
        "codex-cli": {
          enabled: false,
          savedModels: [
            {
              id: "gpt",
              name: "gpt-5.5",
              model: "gpt-5.5",
              createdAt: 1,
            },
          ],
        },
      },
    })

    const resolved = resolveNovelModel(
      {
        ...baseConfig,
        provider: "codex-cli",
        model: "gpt-5.5",
        customEndpoint: "",
      },
      {
        ...DEFAULT_NOVEL_CONFIG,
        writingModel: "custom-1/mimo-v2.5-pro",
      },
      "writing",
    )

    expect(resolved.provider).toBe("custom")
    expect(resolved.model).toBe("mimo-v2.5-pro")
    expect(resolved.customEndpoint).toBe("https://token-plan-cn.xiaomimimo.com/v1")
  })

  it("prefers the active provider over a stale chat model from another provider", () => {
    useWikiStore.setState({
      activePresetId: "custom-1",
      aiChatModel: "claude-code-cli/claude-opus-4-6",
      providerConfigs: {
        ...customConfigs,
        "claude-code-cli": {
          enabled: true,
          model: "claude-opus-4-6",
          savedModels: [
            {
              id: "claude",
              name: "claude-opus-4-6",
              model: "claude-opus-4-6",
              createdAt: 1,
            },
          ],
        },
      },
    })

    const resolved = resolveNovelModel(baseConfig, DEFAULT_NOVEL_CONFIG, "writing")

    expect(resolved.provider).toBe("custom")
    expect(resolved.model).toBe("mimo-v2.5-pro")
    expect(resolved.customEndpoint).toBe("https://token-plan-cn.xiaomimimo.com/v1")
  })
})

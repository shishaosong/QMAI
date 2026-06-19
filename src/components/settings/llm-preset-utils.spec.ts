import { describe, expect, it } from "vitest"
import type { LlmConfig, ProviderConfigs } from "@/stores/wiki-store"
import { getProviderConfig } from "@/lib/llm-providers"
import {
  CUSTOM_LLM_PROFILE_PREFIX,
  buildCustomLlmProfilePreset,
  getCustomLlmProfileIds,
  getLlmPresetById,
  isCustomProviderConfigId,
} from "./llm-preset-utils"
import { resolveConfig } from "./preset-resolver"

const fallback: LlmConfig = {
  provider: "custom",
  apiKey: "",
  model: "",
  ollamaUrl: "http://localhost:11434",
  customEndpoint: "",
  maxContextSize: 204800,
  apiMode: "chat_completions",
  reasoning: { mode: "auto" },
}

describe("custom LLM profiles", () => {
  it("turns a saved custom profile into an active custom endpoint config", () => {
    const id = `${CUSTOM_LLM_PROFILE_PREFIX}backup`
    const configs: ProviderConfigs = {
      [id]: {
        name: "Backup Claude",
        apiKey: "sk-test",
        baseUrl: "https://example.test/v1",
        model: "claude-opus-4-6",
        apiMode: "anthropic_messages",
        maxContextSize: 1_000_000,
        createdAt: 2,
      },
    }

    const preset = getLlmPresetById(id, configs)
    expect(preset?.label).toBe("Backup Claude")
    expect(preset?.provider).toBe("custom")

    const resolved = resolveConfig(preset!, configs[id], fallback)
    expect(resolved.customEndpoint).toBe("https://example.test/v1")
    expect(resolved.model).toBe("claude-opus-4-6")
    expect(resolved.maxContextSize).toBe(1_000_000)

    const provider = getProviderConfig(resolved)
    expect(provider.url).toBe("https://example.test/v1/messages")
  })

  it("keeps custom profiles ordered by creation time", () => {
    const configs: ProviderConfigs = {
      [`${CUSTOM_LLM_PROFILE_PREFIX}later`]: { createdAt: 20 },
      [`${CUSTOM_LLM_PROFILE_PREFIX}first`]: { createdAt: 10 },
      custom: { model: "main" },
    }

    expect(getCustomLlmProfileIds(configs)).toEqual([
      `${CUSTOM_LLM_PROFILE_PREFIX}first`,
      `${CUSTOM_LLM_PROFILE_PREFIX}later`,
    ])
    expect(buildCustomLlmProfilePreset(`${CUSTOM_LLM_PROFILE_PREFIX}first`, configs["custom:first"], 0).label)
      .toBe("自定义模型 2")
  })

  it("does not show raw i18n keys as profile names", () => {
    const preset = buildCustomLlmProfilePreset(
      `${CUSTOM_LLM_PROFILE_PREFIX}missing-i18n`,
      { name: "settings.sections.llm.customProfileDefaultName" },
      1,
    )

    expect(preset.label).toBe("自定义模型 3")
  })

  it("recognizes both old custom profiles and new custom provider cards", () => {
    expect(isCustomProviderConfigId("custom:old-profile")).toBe(true)
    expect(isCustomProviderConfigId("custom-1760000000000")).toBe(true)
    expect(isCustomProviderConfigId("openai")).toBe(false)
  })
})

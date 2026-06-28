import { useWikiStore, type LlmConfig, type NovelConfig, type ProviderOverride } from "@/stores/wiki-store"
import { LLM_PRESETS } from "@/components/settings/llm-presets"
import { resolveConfig } from "@/components/settings/preset-resolver"
import { hasUsableLlm } from "@/lib/has-usable-llm"

export type NovelTaskType = "writing" | "review" | "summary" | "extract" | "lint"

function overrideIncludesModel(override: ProviderOverride | undefined, modelId: string): boolean {
  if (!override || override.enabled === false) return false
  return override.model === modelId || override.savedModels?.some((m) => m.model === modelId) === true
}

function providerIdFromModelRef(modelRef: string): string | null {
  const slashIdx = modelRef.indexOf("/")
  return slashIdx > 0 ? modelRef.slice(0, slashIdx) : null
}

function isStaleModelRef(
  modelRef: string,
  activePresetId: string | null,
  providerConfigs: Record<string, ProviderOverride>,
): boolean {
  const providerId = providerIdFromModelRef(modelRef)
  if (!providerId) return false
  if (activePresetId && providerId !== activePresetId) return true
  return providerConfigs[providerId]?.enabled === false
}

export function resolveKnownModelConfig(
  targetModel: string,
  baseConfig: LlmConfig,
  providerConfigs: Record<string, ProviderOverride>,
): LlmConfig | null {
  const slashIdx = targetModel.indexOf("/")
  if (slashIdx > 0) {
    const providerId = targetModel.slice(0, slashIdx)
    const modelId = targetModel.slice(slashIdx + 1)
    const override = providerConfigs[providerId]
    if (overrideIncludesModel(override, modelId)) {
      const template = LLM_PRESETS.find((p) => p.id === providerId) ?? LLM_PRESETS.find((p) => p.id === "custom")
      if (template) {
        return { ...resolveConfig(template, override, baseConfig), model: modelId }
      }
    }
    return null
  }

  for (const [providerId, override] of Object.entries(providerConfigs)) {
    if (overrideIncludesModel(override, targetModel)) {
      const template = LLM_PRESETS.find((p) => p.id === providerId) ?? LLM_PRESETS.find((p) => p.id === "custom")
      if (template) {
        return { ...resolveConfig(template, override, baseConfig), model: targetModel }
      }
    }
  }

  return null
}

function isConfigUsable(cfg: LlmConfig, providerConfigs: Record<string, ProviderOverride>): boolean {
  return hasUsableLlm(cfg, providerConfigs)
}

export function resolveModelConfig(
  targetModel: string,
  baseConfig: LlmConfig,
  providerConfigs: Record<string, ProviderOverride>,
): LlmConfig {
  const known = resolveKnownModelConfig(targetModel, baseConfig, providerConfigs)
  if (known) return known

  const slashIdx = targetModel.indexOf("/")
  if (slashIdx > 0) {
    const providerId = targetModel.slice(0, slashIdx)
    const modelId = targetModel.slice(slashIdx + 1)
    const override = providerConfigs[providerId]
    if (override?.savedModels?.some((m) => m.model === modelId)) {
      const template = LLM_PRESETS.find((p) => p.id === providerId) ?? LLM_PRESETS.find((p) => p.id === "custom")
      if (template) {
        return { ...resolveConfig(template, override, baseConfig), model: modelId }
      }
    }
    return { ...baseConfig, model: modelId }
  }

  for (const [providerId, override] of Object.entries(providerConfigs)) {
    if (override.savedModels?.some((m) => m.model === targetModel)) {
      const template = LLM_PRESETS.find((p) => p.id === providerId) ?? LLM_PRESETS.find((p) => p.id === "custom")
      if (template) {
        return { ...resolveConfig(template, override, baseConfig), model: targetModel }
      }
    }
  }

  return { ...baseConfig, model: targetModel }
}

export function resolveDefaultModel(baseConfig: LlmConfig): LlmConfig {
  const { providerConfigs, defaultLlmModel, aiChatModel } = useWikiStore.getState()

  const defaultModel = defaultLlmModel?.trim()
  if (defaultModel) {
    const cfg = resolveModelConfig(defaultModel, baseConfig, providerConfigs)
    if (isConfigUsable(cfg, providerConfigs)) {
      return cfg
    }
  }

  const chatModel = aiChatModel?.trim()
  if (chatModel && chatModel !== defaultModel) {
    const cfg = resolveModelConfig(chatModel, baseConfig, providerConfigs)
    if (isConfigUsable(cfg, providerConfigs)) {
      return cfg
    }
  }

  return { ...baseConfig, apiKey: "", model: "" }
}

export function resolveNovelModel(
  llmConfig: LlmConfig,
  novelConfig: NovelConfig,
  taskType: NovelTaskType,
): LlmConfig {
  const modelMap: Record<NovelTaskType, string> = {
    writing: "",
    review: novelConfig.reviewModel,
    summary: novelConfig.summaryModel,
    extract: novelConfig.extractModel,
    lint: novelConfig.reviewModel,
  }

  const { providerConfigs, defaultLlmModel, aiChatModel, activePresetId } = useWikiStore.getState()

  function resolveConfiguredModel(modelRef: string): LlmConfig | null {
    const cfg = resolveModelConfig(modelRef, llmConfig, providerConfigs)
    return isConfigUsable(cfg, providerConfigs) ? cfg : null
  }

  const taskModel = modelMap[taskType]?.trim()
  if (taskModel) {
    const cfg = resolveConfiguredModel(taskModel)
    if (cfg) {
      return cfg
    }
  }

  const writingModel = taskType === "writing" ? novelConfig.writingModel?.trim() : ""

  function resolveStaleFallback(modelRef: string): LlmConfig | null {
    if (!isStaleModelRef(modelRef, activePresetId, providerConfigs)) return null
    if (writingModel) {
      return resolveConfiguredModel(writingModel)
    }
    return isConfigUsable(llmConfig, providerConfigs) ? llmConfig : null
  }

  const chatModel = aiChatModel?.trim()
  if (chatModel) {
    const staleFallback = resolveStaleFallback(chatModel)
    if (staleFallback) {
      return staleFallback
    }

    const cfg = resolveConfiguredModel(chatModel)
    if (cfg) {
      return cfg
    }
  }

  const defaultModel = defaultLlmModel?.trim()
  if (defaultModel && defaultModel !== chatModel) {
    const staleFallback = resolveStaleFallback(defaultModel)
    if (staleFallback) {
      return staleFallback
    }

    const cfg = resolveConfiguredModel(defaultModel)
    if (cfg) {
      return cfg
    }
  }

  if (writingModel && writingModel !== taskModel && writingModel !== chatModel && writingModel !== defaultModel) {
    const cfg = resolveConfiguredModel(writingModel)
    if (cfg) {
      return cfg
    }
  }

  return { ...llmConfig, apiKey: "", model: "" }
}

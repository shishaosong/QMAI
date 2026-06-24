import { useWikiStore, type LlmConfig, type NovelConfig, type ProviderOverride } from "@/stores/wiki-store"
import { resolveConfig } from "@/components/settings/preset-resolver"
import {
  buildProviderModelRef,
  getLlmPresetById,
  isProviderConfigEnabled,
  providerConfigHasModel,
} from "@/components/settings/llm-preset-utils"

export type NovelTaskType = "writing" | "review" | "summary" | "extract" | "lint"

export function resolveKnownModelConfig(
  targetModel: string,
  baseConfig: LlmConfig,
  providerConfigs: Record<string, ProviderOverride>,
): LlmConfig | null {
  const target = targetModel.trim()
  if (!target) return null

  const slashIdx = target.indexOf("/")
  if (slashIdx > 0) {
    const providerId = target.slice(0, slashIdx)
    const modelId = target.slice(slashIdx + 1)
    const override = providerConfigs[providerId]
    if (!providerConfigHasModel(override, modelId)) return null

    const preset = getLlmPresetById(providerId, providerConfigs)
    if (!preset) return null

    return { ...resolveConfig(preset, override, baseConfig), model: modelId }
  }

  for (const [providerId, override] of Object.entries(providerConfigs)) {
    if (!isProviderConfigEnabled(override)) continue
    if (!providerConfigHasModel(override, target)) continue

    const preset = getLlmPresetById(providerId, providerConfigs)
    if (preset) {
      return { ...resolveConfig(preset, override, baseConfig), model: target }
    }
  }

  return null
}

export function resolveModelConfig(
  targetModel: string,
  baseConfig: LlmConfig,
  providerConfigs: Record<string, ProviderOverride>,
): LlmConfig {
  const known = resolveKnownModelConfig(targetModel, baseConfig, providerConfigs)
  if (known) return known

  // Provider-scoped references should never be sent as bare models to
  // whichever endpoint happens to be active. That is how stale Codex/Claude
  // selections leaked into custom API calls.
  if (targetModel.includes("/")) return baseConfig

  const model = targetModel.trim()
  return model ? { ...baseConfig, model } : baseConfig
}

function providerIdFromModelRef(modelRef: string): string | null {
  const slashIdx = modelRef.trim().indexOf("/")
  return slashIdx > 0 ? modelRef.trim().slice(0, slashIdx) : null
}

function modelBelongsToActivePreset(modelRef: string, activePresetId: string | null): boolean {
  const target = modelRef.trim()
  if (!target) return false
  const providerId = providerIdFromModelRef(target)
  if (!activePresetId) return providerId === null
  return providerId === null || providerId === activePresetId
}

/**
 * Resolve the default model for background tasks such as memory and character extraction.
 * Priority: defaultLlmModel > aiChatModel > baseConfig.
 */
export function resolveDefaultModel(baseConfig: LlmConfig): LlmConfig {
  const { providerConfigs, defaultLlmModel, aiChatModel } = useWikiStore.getState()
  const targetModel = defaultLlmModel?.trim() || aiChatModel?.trim()
  if (targetModel) {
    return resolveModelConfig(targetModel, baseConfig, providerConfigs)
  }
  return baseConfig
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

  const taskModel = modelMap[taskType]
  if (!taskModel) {
    const defaultConfig = defaultLlmModel?.trim()
      ? resolveModelConfig(defaultLlmModel, llmConfig, providerConfigs)
      : null
    if (defaultConfig) return defaultConfig

    if (modelBelongsToActivePreset(aiChatModel, activePresetId)) {
      const sessionConfig = resolveKnownModelConfig(aiChatModel, llmConfig, providerConfigs)
      if (sessionConfig) return sessionConfig
    }

    const activeModelRef = buildProviderModelRef(
      activePresetId,
      activePresetId ? providerConfigs[activePresetId] : undefined,
      llmConfig.model,
    )
    const activeConfig = resolveKnownModelConfig(activeModelRef, llmConfig, providerConfigs)
    if (activeConfig) return activeConfig

    const writingConfig = resolveKnownModelConfig(novelConfig.writingModel, llmConfig, providerConfigs)
    if (writingConfig) return writingConfig

    return llmConfig
  }

  return resolveModelConfig(taskModel, llmConfig, providerConfigs)
}

import type { ProviderConfigs, ProviderOverride } from "@/stores/wiki-store"
import { LLM_PRESETS, type LlmPreset } from "./llm-presets"

export const CUSTOM_LLM_PROFILE_PREFIX = "custom:"
export const CUSTOM_PROVIDER_CARD_PREFIX = "custom-"

export function isCustomLlmProfileId(id: string): boolean {
  return id.startsWith(CUSTOM_LLM_PROFILE_PREFIX)
}

export function isCustomProviderConfigId(id: string): boolean {
  return id.startsWith(CUSTOM_PROVIDER_CARD_PREFIX) || isCustomLlmProfileId(id)
}

export function createCustomLlmProfileId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${CUSTOM_LLM_PROFILE_PREFIX}${random}`
}

export function getCustomLlmProfileIds(configs: ProviderConfigs): string[] {
  return Object.keys(configs)
    .filter(isCustomLlmProfileId)
    .sort((a, b) => {
      const aTime = configs[a]?.createdAt ?? 0
      const bTime = configs[b]?.createdAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return a.localeCompare(b)
    })
}

export function getCustomProviderConfigIds(configs: ProviderConfigs): string[] {
  return Object.keys(configs)
    .filter(isCustomProviderConfigId)
    .sort((a, b) => {
      const aTime = configs[a]?.createdAt ?? 0
      const bTime = configs[b]?.createdAt ?? 0
      if (aTime !== bTime) return aTime - bTime
      return a.localeCompare(b)
    })
}

export function isMissingLlmProfileTranslationKey(value: string): boolean {
  return value.startsWith("settings.sections.llm.")
}

export function getCustomLlmProfileLabel(override: ProviderOverride | undefined, index = 0): string {
  const name = override?.name?.trim() || override?.label?.trim() || ""
  if (name && !isMissingLlmProfileTranslationKey(name)) return name
  return `自定义模型 ${index + 2}`
}

export function buildCustomLlmProfilePreset(
  id: string,
  override: ProviderOverride | undefined,
  index = 0,
): LlmPreset {
  const base = LLM_PRESETS.find((preset) => preset.id === "custom") ?? LLM_PRESETS[0]
  if (!base) throw new Error("Missing custom LLM preset")
  const model = override?.model?.trim()
  const endpoint = override?.baseUrl?.trim()
  const hintParts = [model, endpoint].filter((item): item is string => !!item)

  return {
    ...base,
    id,
    label: getCustomLlmProfileLabel(override, index),
    hint: hintParts.length > 0 ? hintParts.join(" · ") : base?.hint,
    defaultModel: undefined,
    suggestedModels: [],
    suggestedContextSize: override?.maxContextSize ?? base?.suggestedContextSize,
    apiMode: override?.apiMode ?? base?.apiMode ?? "chat_completions",
    baseUrl: override?.baseUrl ?? base?.baseUrl,
  }
}

export function getLlmPresetById(
  id: string | null,
  configs: ProviderConfigs = {},
): LlmPreset | undefined {
  if (!id) return undefined
  const staticPreset = LLM_PRESETS.find((preset) => preset.id === id)
  if (staticPreset) return staticPreset
  if (isCustomProviderConfigId(id)) {
    const index = getCustomProviderConfigIds(configs).indexOf(id)
    return buildCustomLlmProfilePreset(id, configs[id], index >= 0 ? index : 0)
  }
  return undefined
}

export function isProviderConfigEnabled(override: ProviderOverride | undefined): boolean {
  return override?.enabled !== false
}

export function getPrimaryProviderModel(
  override: ProviderOverride | undefined,
  fallbackModel = "",
): string {
  const savedModel = (override?.savedModels ?? [])
    .map((item) => item.model.trim())
    .find(Boolean)
  const overrideModel = override?.model?.trim()
  return savedModel ?? (overrideModel || fallbackModel.trim())
}

export function buildProviderModelRef(
  providerId: string | null,
  override: ProviderOverride | undefined,
  fallbackModel = "",
): string {
  if (!providerId) return ""
  const model = getPrimaryProviderModel(override, fallbackModel)
  return model ? `${providerId}/${model}` : ""
}

export function providerConfigHasModel(
  override: ProviderOverride | undefined,
  modelId: string,
): boolean {
  const model = modelId.trim()
  if (!model || !isProviderConfigEnabled(override)) return false
  if ((override?.savedModels ?? []).some((item) => item.model.trim() === model)) {
    return true
  }
  return override?.model?.trim() === model
}

export function isKnownProviderModelRef(
  value: string,
  configs: ProviderConfigs,
): boolean {
  const target = value.trim()
  if (!target) return false

  const slashIdx = target.indexOf("/")
  if (slashIdx > 0) {
    const providerId = target.slice(0, slashIdx)
    const modelId = target.slice(slashIdx + 1)
    return providerConfigHasModel(configs[providerId], modelId)
  }

  return Object.values(configs).some((override) =>
    providerConfigHasModel(override, target),
  )
}

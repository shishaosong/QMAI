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

export function isMissingLlmProfileTranslationKey(value: string): boolean {
  return value.startsWith("settings.sections.llm.")
}

export function getCustomLlmProfileLabel(override: ProviderOverride | undefined, index = 0): string {
  const name = override?.name?.trim() ?? ""
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
  if (isCustomLlmProfileId(id)) {
    const index = getCustomLlmProfileIds(configs).indexOf(id)
    return buildCustomLlmProfilePreset(id, configs[id], index >= 0 ? index : 0)
  }
  return undefined
}

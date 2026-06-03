import { getProviderConfig } from "@/lib/llm-providers"
import { isDirectRerankEndpoint } from "@/lib/rerank-api"
import { getHttpFetch } from "@/lib/tauri-fetch"
import type { EmbeddingConfig, LlmConfig, RerankConfig } from "@/stores/wiki-store"

export interface LlmModelListResult {
  models: string[]
}

function uniqueSortedModels(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

function parseModelListResponse(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return []
  const candidates = Array.isArray((raw as { data?: unknown }).data)
    ? (raw as { data: unknown[] }).data
    : Array.isArray((raw as { models?: unknown }).models)
      ? (raw as { models: unknown[] }).models
      : []

  return candidates.map((item) => {
    if (typeof item === "string") return item
    if (item && typeof item === "object") {
      const id = (item as { id?: unknown; name?: unknown; model?: unknown }).id
        ?? (item as { id?: unknown; name?: unknown; model?: unknown }).name
        ?? (item as { id?: unknown; name?: unknown; model?: unknown }).model
      return typeof id === "string" ? id : ""
    }
    return ""
  })
}

function stripGoogleApiKeyQuery(endpoint: string): string {
  if (!endpoint.includes("?")) return endpoint
  try {
    const url = new URL(endpoint)
    url.searchParams.delete("key")
    return url.toString()
  } catch {
    return endpoint.replace(/([?&])key=[^&]*&?/i, (_, prefix: string) => (prefix === "?" ? "?" : "&"))
      .replace(/[?&]$/, "")
      .replace("?&", "?")
  }
}

function buildEndpointModelsUrl(endpoint: string): string {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    throw new Error("请先填写接口地址后再拉取模型列表。")
  }

  if (trimmed.includes("generativelanguage.googleapis.com") || /:embedcontent(\?|$)/i.test(trimmed)) {
    const base = stripGoogleApiKeyQuery(trimmed)
      .replace(/\/+$/, "")
      .replace(/\/models\/[^/?]+:(?:embedContent|batchEmbedContents)(?:\?.*)?$/i, "")
      .replace(/\/models\/[^/?]+(?:\?.*)?$/i, "")
      .replace(/\/models(?:\?.*)?$/i, "")
    return `${base}/models`
  }

  if (/\/embeddings(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\/embeddings(?:\?.*)?$/i, "/models")
  }
  if (/\/chat\/completions(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions(?:\?.*)?$/i, "/models")
  }
  if (/\/responses(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\/responses(?:\?.*)?$/i, "/models")
  }
  if (/\/messages(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\/messages(?:\?.*)?$/i, "/models")
  }
  if (/\/rerank(?:\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\/rerank(?:\?.*)?$/i, "/models")
  }
  if (/\/models(?:\?.*)?$/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed.replace(/\/+$/, "")}/models`
}

function toModelListResult(models: string[]): LlmModelListResult {
  return { models: uniqueSortedModels(models) }
}

function buildModelsUrl(config: LlmConfig): { url: string; headers: Record<string, string> } {
  if (config.provider === "google") {
    const base = stripGoogleApiKeyQuery(config.customEndpoint.trim() || "https://generativelanguage.googleapis.com/v1beta")
      .replace(/\/+$/, "")
      .replace(/\/models(?:\/[^/?]+(?::(?:embedContent|batchEmbedContents))?)?$/i, "")
    return {
      url: `${base}/models`,
      headers: config.apiKey ? { "x-goog-api-key": config.apiKey } : {},
    }
  }

  if (config.provider === "claude-code" || config.provider === "codex-cli") {
    return {
      url: "",
      headers: {},
    }
  }

  const providerConfig = getProviderConfig(config)
  const url = providerConfig.url
  let modelsUrl: string

  if (/\/chat\/completions(?:\?.*)?$/i.test(url)) {
    modelsUrl = url.replace(/\/chat\/completions(?:\?.*)?$/i, "/models")
  } else if (/\/responses(?:\?.*)?$/i.test(url)) {
    modelsUrl = url.replace(/\/responses(?:\?.*)?$/i, "/models")
  } else if (/\/messages(?:\?.*)?$/i.test(url)) {
    modelsUrl = url.replace(/\/messages(?:\?.*)?$/i, "/models")
  } else if (/\/rerank(?:\?.*)?$/i.test(url)) {
    modelsUrl = url.replace(/\/rerank(?:\?.*)?$/i, "/models")
  } else {
    modelsUrl = `${url.replace(/\/+$/, "")}/models`
  }

  const { "Content-Type": _contentType, ...headers } = providerConfig.headers
  return { url: modelsUrl, headers }
}

async function fetchModelList(url: string, headers: Record<string, string>, _currentModel: string): Promise<LlmModelListResult> {
  const httpFetch = await getHttpFetch()
  const response = await httpFetch(url, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`模型列表拉取失败：HTTP ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`)
  }

  return toModelListResult(parseModelListResponse(await response.json()))
}

export async function fetchLlmModelList(config: LlmConfig): Promise<LlmModelListResult> {
  if (config.provider === "claude-code" || config.provider === "codex-cli") {
    const model = config.model.trim()
    if (!model) throw new Error("当前 CLI 模型配置为空，无法拉取模型列表。")
    return { models: [model] }
  }

  const { url, headers } = buildModelsUrl(config)
  const result = await fetchModelList(url, headers, config.model)
  if (config.provider === "google") {
    return toModelListResult(result.models.map((model) => model.replace(/^models\//, "")))
  }
  return result
}

export async function fetchEmbeddingModelList(config: EmbeddingConfig): Promise<LlmModelListResult> {
  const url = buildEndpointModelsUrl(config.endpoint)
  const isGoogle = url.includes("generativelanguage.googleapis.com")
  const headers: Record<string, string> = {}

  if (config.apiKey.trim()) {
    if (isGoogle) {
      headers["x-goog-api-key"] = config.apiKey.trim()
    } else {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`
    }
  }

  const result = await fetchModelList(url, headers, config.model)
  if (isGoogle) {
    return toModelListResult(result.models.map((model) => model.replace(/^models\//, "")))
  }
  return result
}

export async function fetchRerankModelList(
  llmConfig: LlmConfig,
  rerankConfig: RerankConfig,
): Promise<LlmModelListResult> {
  if (rerankConfig.useMainLlm) {
    return fetchLlmModelList(llmConfig)
  }

  if (isDirectRerankEndpoint({ provider: rerankConfig.provider, customEndpoint: rerankConfig.customEndpoint })) {
    return fetchModelList(
      buildEndpointModelsUrl(rerankConfig.customEndpoint),
      rerankConfig.apiKey.trim() ? { Authorization: `Bearer ${rerankConfig.apiKey.trim()}` } : {},
      rerankConfig.model,
    )
  }

  return fetchLlmModelList({
    provider: rerankConfig.provider,
    apiKey: rerankConfig.apiKey,
    model: rerankConfig.model,
    ollamaUrl: rerankConfig.ollamaUrl,
    customEndpoint: rerankConfig.customEndpoint,
    apiMode: rerankConfig.provider === "custom" ? rerankConfig.apiMode : undefined,
    maxContextSize: Math.min(llmConfig.maxContextSize ?? 65_536, 65_536),
    reasoning: { mode: "off" },
  })
}

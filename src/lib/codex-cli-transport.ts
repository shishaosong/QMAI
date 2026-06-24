/**
 * Codex CLI subprocess transport.
 *
 * Rust-side counterpart: src-tauri/src/commands/codex_cli.rs. The Rust
 * command spawns `codex exec --json`, sends a single reconstructed prompt
 * over stdin, and emits each JSONL stdout line back as `codex-cli:{streamId}`.
 */

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useWikiStore, type LlmConfig } from "@/stores/wiki-store"
import { normalizePath } from "@/lib/path-utils"
import type { ChatMessage, ContentBlock, RequestOverrides } from "./llm-providers"
import type { StreamCallbacks } from "./llm-client"

function textFromCodexContent(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null
  if (!value) return null

  if (Array.isArray(value)) {
    const text = value
      .map((part) => textFromCodexContent(part))
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join("")
    return text.length > 0 ? text : null
  }

  if (typeof value !== "object") return null
  const obj = value as Record<string, unknown>

  for (const key of ["text", "output_text", "message", "result"] as const) {
    const text = textFromCodexContent(obj[key])
    if (text) return text
  }

  for (const key of ["content", "output", "response", "last_message"] as const) {
    const text = textFromCodexContent(obj[key])
    if (text) return text
  }

  return null
}

export function parseCodexCliLine(rawLine: string): string | null {
  const line = rawLine.trim()
  if (!line) return null

  let evt: unknown
  try {
    evt = JSON.parse(line)
  } catch {
    return null
  }

  if (!evt || typeof evt !== "object") return null
  const obj = evt as Record<string, unknown>
  const type = typeof obj.type === "string" ? obj.type : ""

  if (type === "item.completed") {
    const item = obj.item as Record<string, unknown> | undefined
    const itemType = typeof item?.type === "string" ? item.type : ""
    const role = typeof item?.role === "string" ? item.role : ""
    const isAssistantMessage =
      itemType === "agent_message" ||
      itemType === "assistant_message" ||
      role === "assistant" ||
      (itemType === "message" && !role)
    if (!item || !isAssistantMessage) {
      return null
    }
    return textFromCodexContent(item)
  }

  if (/^(agent_message|assistant_message|message)(\.completed)?$/.test(type)) {
    const role = typeof obj.role === "string" ? obj.role : ""
    if (role && role !== "assistant") return null
    return textFromCodexContent(obj)
  }

  if (type === "turn.completed" || type === "response.completed") {
    return textFromCodexContent(obj)
  }

  return null
}

export function parseLastCodexCliAssistantText(rawOutput: string): string | null {
  let lastText: string | null = null
  for (const line of rawOutput.split(/\r?\n/)) {
    const text = parseCodexCliLine(line)
    if (text !== null) lastText = text
  }
  return lastText
}

export function extractCodexCliError(rawOutput: string): string {
  let lastError = ""
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string
        message?: unknown
        error?: { message?: unknown }
      }
      const message = typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : ""
      if (parsed.type === "turn.failed" && message) return message
      if (parsed.type === "error" && message && !/^Reconnecting\.\.\./i.test(message)) {
        lastError = message
      }
    } catch {
      // Keep the original output as fallback below.
    }
  }
  return lastError || rawOutput.trim()
}

function contentToText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content
  return content
    .map((block) => {
      if (block.type === "text") return block.text
      return `[Image omitted: ${block.mediaType}]`
    })
    .join("\n")
}

function escapePromptContent(text: string): string {
  return text.replace(/<\/?[A-Z_][A-Z0-9_]*>/gi, (tag) =>
    tag.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  )
}

export function buildPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role.toUpperCase()
      return `<${role}>\n${escapePromptContent(contentToText(message.content))}\n</${role}>`
    })
    .join("\n\n")
}

type SpawnPayload = Record<string, unknown> & {
  streamId: string
  model: string
  prompt: string
  isolateLocalConfig: boolean
  projectPath?: string
  timeoutMinutes?: number
}

function currentProjectPath(): string | undefined {
  const path = useWikiStore.getState().project?.path?.trim()
  return path ? normalizePath(path) : undefined
}

export async function streamCodexCli(
  config: LlmConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  overrides?: RequestOverrides,
): Promise<void> {
  const { onToken, onDone, onError } = callbacks

  if (import.meta.env?.DEV && overrides) {
    for (const key of ["temperature", "top_p", "top_k", "max_tokens", "stop"] as const) {
      if (overrides[key] !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(`[codex-cli] ignoring unsupported override "${key}": CLI has no equivalent flag`)
      }
    }
  }

  const streamId = crypto.randomUUID()
  let unlistenData: UnlistenFn | undefined
  let unlistenDone: UnlistenFn | undefined
  let finished = false
  let aborted = signal?.aborted ?? false
  let lastAgentMessage: string | null = null
  let resolveCompletion: () => void = () => {}
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })

  const unparsedLines: string[] = []
  let unparsedSize = 0
  function captureUnparsed(line: string) {
    if (unparsedSize >= 4096) return
    const trimmed = line.trim()
    if (!trimmed) return
    unparsedLines.push(line)
    unparsedSize += line.length + 1
  }

  const cleanup = () => {
    unlistenData?.()
    unlistenDone?.()
  }

  const finishWith = (cb: () => void) => {
    if (finished) return
    finished = true
    cleanup()
    cb()
    resolveCompletion()
  }

  let emittedText = ""
  const emitCodexText = (text: string) => {
    let nextText = text
    if (emittedText && text === emittedText) return
    if (emittedText && text.startsWith(emittedText)) {
      nextText = text.slice(emittedText.length)
    }
    if (!nextText) return
    emittedText += nextText
    onToken(nextText)
  }

  const captureCodexText = (line: string) => {
    const token = parseCodexCliLine(line)
    if (token !== null) {
      lastAgentMessage = token
      return
    }
    captureUnparsed(line)
  }

  const signalTimedOut = () => {
    const reason = signal?.reason as { name?: unknown; message?: unknown } | undefined
    return reason?.name === "TimeoutError" || /timeout/i.test(String(reason?.message ?? ""))
  }

  const abortListener = () => {
    aborted = true
    void invoke("codex_cli_kill", { streamId }).catch(() => {})
    if (signalTimedOut()) {
      finishWith(() => onError(new Error("Codex CLI request timed out before returning content. Try again, or increase the Codex CLI timeout in Settings.")))
    } else {
      finishWith(onDone)
    }
  }
  if (aborted) {
    if (signalTimedOut()) {
      finishWith(() => onError(new Error("Codex CLI request timed out before returning content. Try again, or increase the Codex CLI timeout in Settings.")))
    } else {
      finishWith(onDone)
    }
    return
  }
  signal?.addEventListener("abort", abortListener)

  try {
    unlistenData = await listen<string>(`codex-cli:${streamId}`, (event) => {
      captureCodexText(event.payload)
    })
    if (aborted || finished) {
      cleanup()
      return
    }

    unlistenDone = await listen<{ code: number | null; stderr: string; stdout?: string }>(
      `codex-cli:${streamId}:done`,
      (event) => {
        const code = event.payload?.code
        const stderr = event.payload?.stderr?.trim() ?? ""
        const stdout = event.payload?.stdout ?? ""
        if (code !== null && code !== undefined && code !== 0) {
          const details = stderr || extractCodexCliError(stdout) || extractCodexCliError(unparsedLines.join("\n"))
          finishWith(() =>
            onError(new Error(
              details
                ? `Codex CLI exited with code ${code}:\n${details}`
                : `Codex CLI exited with code ${code}. Run \`codex\` in a terminal to inspect the problem.`,
            )),
          )
        } else {
          const finalText = lastAgentMessage ?? parseLastCodexCliAssistantText(stdout)
          if (finalText) {
            emitCodexText(finalText)
          }
          if (!emittedText.trim()) {
            const details = stdout.trim() || unparsedLines.join("\n").trim()
            finishWith(() =>
              onError(new Error(
                details
                  ? `Codex CLI completed but did not emit assistant content. Raw output:\n${details}`
                  : "Codex CLI completed but did not emit assistant content. Run `codex exec --json` in a terminal to inspect the provider output.",
              )),
            )
          } else {
            finishWith(onDone)
          }
        }
      },
    )
    if (aborted || finished) {
      cleanup()
      return
    }

    const payload: SpawnPayload = {
      streamId,
      model: config.model,
      prompt: buildPrompt(messages),
      isolateLocalConfig: config.localCliIsolation === true,
      projectPath: currentProjectPath(),
      timeoutMinutes: config.codexCliTimeoutMinutes,
    }
    await invoke("codex_cli_spawn", payload)
    if (aborted || signal?.aborted) {
      aborted = true
      await invoke("codex_cli_kill", { streamId }).catch(() => {})
      if (signalTimedOut()) {
        finishWith(() => onError(new Error("Codex CLI request timed out before returning content. Try again, or increase the Codex CLI timeout in Settings.")))
      } else {
        finishWith(onDone)
      }
      return
    }
    await completion
  } catch (err) {
    finishWith(() => {
      const message = err instanceof Error ? err.message : String(err)
      if (/not found|No such file|executable file not found/i.test(message)) {
        onError(new Error(
          "Codex CLI not found. Install `codex` with `npm install -g @openai/codex` or pick a different provider.",
        ))
      } else {
        onError(err instanceof Error ? err : new Error(message))
      }
    })
  } finally {
    signal?.removeEventListener("abort", abortListener)
  }
}

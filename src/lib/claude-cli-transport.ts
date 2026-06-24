/**
 * Claude Code CLI subprocess transport.
 *
 * Rust-side counterpart: src-tauri/src/commands/claude_cli.rs. The Rust
 * commands spawn `claude -p --output-format stream-json
 * --input-format stream-json --verbose --model <model>`, pipe the
 * serialized history over stdin, and emit stdout back as
 * `claude-cli:{streamId}` events (one line per event). This module
 * listens for those events, parses each line as a stream-json event,
 * and forwards assistant text to `onToken`.
 */

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { httpCli } from "@/lib/http-adapter"
import { isTauri } from "@/lib/platform"
import { normalizePath } from "@/lib/path-utils"
import { serverEvents } from "@/lib/server-events"
import { useWikiStore, type LlmConfig } from "@/stores/wiki-store"
import type { ChatMessage, RequestOverrides } from "./llm-providers"
import type { StreamCallbacks } from "./llm-client"

export function createClaudeCodeStreamParser() {
  let emittedText = ""

  const emitNovelText = (text: string): string | null => {
    if (!text) return null
    if (text.startsWith(emittedText)) {
      const novel = text.slice(emittedText.length)
      emittedText = text
      return novel || null
    }
    if (emittedText.length === 0) {
      emittedText = text
      return text
    }
    return null
  }

  return function parseLine(rawLine: string): string | null {
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
    const type = obj.type

    if (type === "stream_event") {
      const event = obj.event as Record<string, unknown> | undefined
      if (event?.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          emittedText += delta.text
          return delta.text
        }
      }
      return null
    }

    if (type === "assistant") {
      const message = obj.message as Record<string, unknown> | undefined
      const content = message?.content
      if (!Array.isArray(content)) return null
      const text = content
        .map((c) => {
          const cc = c as Record<string, unknown>
          return cc.type === "text" && typeof cc.text === "string" ? cc.text : ""
        })
        .join("")
      return emitNovelText(text)
    }

    if (
      type === "result" &&
      obj.subtype === "success" &&
      obj.is_error !== true &&
      typeof obj.result === "string"
    ) {
      return emitNovelText(obj.result)
    }

    return null
  }
}

type SpawnPayload = Record<string, unknown> & {
  streamId: string
  model: string
  messages: ChatMessage[]
  isolateLocalConfig: boolean
  projectPath?: string
}

function currentProjectPath(): string | undefined {
  const path = useWikiStore.getState().project?.path?.trim()
  return path ? normalizePath(path) : undefined
}

export async function streamClaudeCodeCli(
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
        console.warn(`[claude-code] ignoring unsupported override "${key}": CLI has no equivalent flag`)
      }
    }
  }

  const streamId = crypto.randomUUID()
  const parse = createClaudeCodeStreamParser()

  let unlistenData: UnlistenFn | (() => void) | undefined
  let unlistenDone: UnlistenFn | (() => void) | undefined
  let finished = false
  let aborted = signal?.aborted ?? false
  let emittedToken = false
  let resolveCompletion: () => void = () => {}
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })

  const UNPARSED_BUFFER_CAP = 4096
  const unparsedLines: string[] = []
  let unparsedSize = 0
  function captureUnparsed(line: string) {
    if (unparsedSize >= UNPARSED_BUFFER_CAP) return
    const trimmed = line.trim()
    if (trimmed.length === 0) return
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

  const abortListener = () => {
    aborted = true
    if (isTauri()) {
      void invoke("claude_cli_kill", { streamId }).catch(() => {})
    } else {
      void httpCli.claudeKill(streamId).catch(() => {})
    }
    finishWith(onDone)
  }
  if (aborted) {
    finishWith(onDone)
    return
  }
  signal?.addEventListener("abort", abortListener)

  try {
    if (isTauri()) {
      unlistenData = await listen<string>(`claude-cli:${streamId}`, (event) => {
        const token = parse(event.payload)
        if (token !== null) {
          emittedToken = true
          onToken(token)
        } else {
          captureUnparsed(event.payload)
        }
      })
      if (aborted || finished) {
        cleanup()
        return
      }

      unlistenDone = await listen<{ code: number | null; stderr: string }>(
        `claude-cli:${streamId}:done`,
        (event) => {
          const code = event.payload?.code
          const stderr = event.payload?.stderr?.trim() ?? ""
          if (code !== null && code !== undefined && code !== 0) {
            finishWith(() =>
              onError(new Error(buildExitError(code, stderr, unparsedLines.join("\n")))),
            )
          } else if (!emittedToken) {
            const details = stderr || unparsedLines.join("\n").trim()
            finishWith(() =>
              onError(new Error(
                details
                  ? `Claude Code CLI completed but returned no content:\n${details}`
                  : "Claude Code CLI completed but returned no content. Try running `claude -p` in a terminal to inspect the output, or switch to the Anthropic API in Settings.",
              )),
            )
          } else {
            finishWith(onDone)
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
        messages,
        isolateLocalConfig: config.localCliIsolation === true,
        projectPath: currentProjectPath(),
      }
      await invoke("claude_cli_spawn", payload)
    } else {
      serverEvents.connect()

      unlistenData = serverEvents.on("claude-cli", (event) => {
        const payload = event.payload as { streamId: string; data: string }
        if (payload.streamId !== streamId) return
        const token = parse(payload.data)
        if (token !== null) {
          emittedToken = true
          onToken(token)
        } else {
          captureUnparsed(payload.data)
        }
      })
      if (aborted || finished) {
        cleanup()
        return
      }

      unlistenDone = serverEvents.on("claude-cli:done", (event) => {
        const payload = event.payload as { streamId: string; code: number | null; stderr: string }
        if (payload.streamId !== streamId) return
        const code = payload.code
        const stderr = payload.stderr?.trim() ?? ""
        if (code !== null && code !== undefined && code !== 0) {
          finishWith(() =>
            onError(new Error(buildExitError(code, stderr, unparsedLines.join("\n")))),
          )
        } else if (!emittedToken) {
          const details = stderr || unparsedLines.join("\n").trim()
          finishWith(() =>
            onError(new Error(
              details
                ? `Claude Code CLI completed but returned no content:\n${details}`
                : "Claude Code CLI completed but returned no content. Try running `claude -p` in a terminal to inspect the output, or switch to the Anthropic API in Settings.",
            )),
          )
        } else {
          finishWith(onDone)
        }
      })
      if (aborted || finished) {
        cleanup()
        return
      }

      await httpCli.claudeSpawn(streamId, config.model, messages, config.localCliIsolation === true)
    }

    if (aborted || signal?.aborted) {
      aborted = true
      if (isTauri()) {
        await invoke("claude_cli_kill", { streamId }).catch(() => {})
      } else {
        await httpCli.claudeKill(streamId).catch(() => {})
      }
      finishWith(onDone)
      return
    }
    await completion
  } catch (err) {
    finishWith(() => {
      const message = err instanceof Error ? err.message : String(err)
      if (/not found|No such file|executable file not found/i.test(message)) {
        onError(new Error(
          "Claude Code CLI not found. Install `claude` (https://www.anthropic.com/claude-code) or pick a different provider.",
        ))
      } else {
        onError(err instanceof Error ? err : new Error(message))
      }
    })
  } finally {
    signal?.removeEventListener("abort", abortListener)
  }
}

export function buildExitError(
  code: number,
  stderr: string,
  unparsedStdout: string = "",
): string {
  if (/unauthenticated|please.*log\s*in|authentication.*failed/i.test(stderr)) {
    return [
      "Claude Code CLI is not authenticated.",
      "Please open a terminal and run `claude` to complete the OAuth login,",
      "then retry. (LLM Wiki only spawns the binary; it can't run the",
      "login flow on your behalf.)",
      stderr ? `\n\nstderr:\n${stderr}` : "",
    ].join(" ").trim()
  }
  if (stderr) {
    return `claude CLI exited with code ${code}: ${stderr}`
  }
  const stdoutError = extractClaudeCodeCliError(unparsedStdout)
  if (stdoutError) {
    return `claude CLI failed with code ${code}: ${stdoutError}`
  }
  if (unparsedStdout.trim()) {
    return [
      `claude CLI exited with code ${code} (no stderr).`,
      "Captured stdout output that LLM Wiki couldn't parse; pasting it",
      "here so you can see what the CLI actually emitted:\n",
      unparsedStdout.trim(),
    ].join(" ")
  }
  return [
    `claude CLI exited silently with code ${code}.`,
    "No stdout or stderr was captured; try running `claude -p` in a",
    "terminal with the same prompt to see what's wrong, or switch to",
    "the official Anthropic API in Settings.",
  ].join(" ")
}

export function extractClaudeCodeCliError(rawOutput: string): string {
  for (const line of rawOutput.split(/\r?\n/).reverse()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string
        is_error?: boolean
        result?: unknown
        message?: unknown
        error?: unknown
      }
      if (parsed.type === "result" && parsed.is_error === true && typeof parsed.result === "string") {
        return parsed.result
      }
      if (parsed.type === "error") {
        if (typeof parsed.message === "string") return parsed.message
        if (typeof parsed.error === "string") return parsed.error
        if (parsed.error && typeof parsed.error === "object") {
          const errorObj = parsed.error as Record<string, unknown>
          if (typeof errorObj.message === "string") return errorObj.message
        }
      }
    } catch {
      // Keep scanning older lines.
    }
  }
  return ""
}

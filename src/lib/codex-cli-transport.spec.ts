import { describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}))

vi.mock("@/stores/wiki-store", () => ({
  useWikiStore: {
    getState: vi.fn(() => ({ project: null })),
  },
}))

import { parseCodexCliLine, parseLastCodexCliAssistantText } from "./codex-cli-transport"

describe("parseCodexCliLine", () => {
  it("parses legacy agent_message completion events", () => {
    expect(parseCodexCliLine(JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "模型测试成功" },
    }))).toBe("模型测试成功")
  })

  it("parses assistant message content arrays from newer Codex CLI output", () => {
    expect(parseCodexCliLine(JSON.stringify({
      type: "item.completed",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "模型测试成功" }],
      },
    }))).toBe("模型测试成功")
  })

  it("parses completed turn response output when no item event is emitted", () => {
    expect(parseCodexCliLine(JSON.stringify({
      type: "turn.completed",
      response: {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "模型测试成功" }],
          },
        ],
      },
    }))).toBe("模型测试成功")
  })

  it("ignores non-assistant message items", () => {
    expect(parseCodexCliLine(JSON.stringify({
      type: "item.completed",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "不要输出这个" }],
      },
    }))).toBeNull()
  })

  it("uses the final assistant message when Codex emits tool preambles", () => {
    const output = [
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "I am opening the prompt file." },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "Get-Content prompt.txt",
          status: "completed",
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "OK" },
      }),
    ].join("\n")

    expect(parseLastCodexCliAssistantText(output)).toBe("OK")
  })
})

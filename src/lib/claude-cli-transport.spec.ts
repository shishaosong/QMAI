import { describe, expect, it } from "vitest"
import { createClaudeCodeStreamParser } from "./claude-cli-transport"

describe("createClaudeCodeStreamParser", () => {
  it("emits final result text when no assistant text event is present", () => {
    const parse = createClaudeCodeStreamParser()

    expect(parse(JSON.stringify({
      type: "system",
      subtype: "thinking_tokens",
      estimated_tokens: 37,
    }))).toBeNull()

    expect(parse(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "chapter text",
    }))).toBe("chapter text")
  })

  it("does not duplicate result text after an assistant text event", () => {
    const parse = createClaudeCodeStreamParser()

    expect(parse(JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "chapter text" }],
      },
    }))).toBe("chapter text")

    expect(parse(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "chapter text",
    }))).toBeNull()
  })

  it("emits only missing tail text after streaming deltas", () => {
    const parse = createClaudeCodeStreamParser()

    expect(parse(JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "chapter " },
      },
    }))).toBe("chapter ")

    expect(parse(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "chapter text",
    }))).toBe("text")
  })

  it("ignores thinking-only assistant events before the final result", () => {
    const parse = createClaudeCodeStreamParser()

    expect(parse(JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "thinking", thinking: "internal" }],
      },
    }))).toBeNull()

    expect(parse(JSON.stringify({
      type: "result",
      subtype: "success",
      result: "visible text",
    }))).toBe("visible text")
  })
})

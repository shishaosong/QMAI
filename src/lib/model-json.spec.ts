import { describe, expect, it } from "vitest"
import { extractJsonObjectTextFromModelOutput, parseJsonObjectFromModelOutput } from "./model-json"

describe("model-json", () => {
  it("extracts a balanced object from fenced model output", () => {
    const output = [
      "Here is the JSON:",
      "```json",
      '{"summary":"ok","nested":{"value":"brace } inside string"}}',
      "```",
    ].join("\n")

    expect(extractJsonObjectTextFromModelOutput(output)).toBe('{"summary":"ok","nested":{"value":"brace } inside string"}}')
  })

  it("parses loose JSON with smart quotes and trailing commas", () => {
    const parsed = parseJsonObjectFromModelOutput('```json\n{“summary”: “ok”, “items”: [“a”,],}\n```')

    expect(parsed).toEqual({ summary: "ok", items: ["a"] })
  })

  it("repairs unescaped quotes inside model-generated string values", () => {
    const parsed = parseJsonObjectFromModelOutput(
      '{"summary":"系统显示 "时间锚点稳定中" 和 "宿主适配度 98%"，暗示实验", "characters":["林枫",],}',
    )

    expect(parsed).toEqual({
      summary: '系统显示 "时间锚点稳定中" 和 "宿主适配度 98%"，暗示实验',
      characters: ["林枫"],
    })
  })

  it("throws a useful error when no object exists", () => {
    expect(() => parseJsonObjectFromModelOutput("not json")).toThrow(/parseable JSON object/)
  })
})

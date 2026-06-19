import { describe, expect, it } from "vitest"
import { formatChapterWriting } from "./chapter-formatting"

describe("formatChapterWriting", () => {
  it("normalizes chapter body without adding first-line indentation", () => {
    const formatted = formatChapterWriting([
      "---",
      "title: 第1章",
      "---",
      "# 第1章",
      "",
      "　　第一段正文。",
      "  第二段正文。",
      "",
      "- 列表项",
    ].join("\n"))

    expect(formatted).toBe([
      "---",
      "title: 第1章",
      "---",
      "# 第1章",
      "",
      "第一段正文。",
      "第二段正文。",
      "",
      "- 列表项",
    ].join("\n"))
  })
})

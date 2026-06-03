import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { StreamingMessage } from "./chat-message"
import { getDeepChapterToggleButtonClass } from "./chat-panel"

function tenThinkingLines(): string {
  return Array.from({ length: 10 }, (_value, index) => `stage line ${index + 1}`).join("\n")
}

describe("chat thinking display", () => {
  it("keeps completed thinking content in a fixed scrollable panel", () => {
    const thinking = tenThinkingLines()
    const html = renderToStaticMarkup(
      <StreamingMessage content={`<think>\n${thinking}\n</think>\n\nfinal answer`} />,
    )

    expect(html).toContain("stage line 1")
    expect(html).toContain("stage line 10")
    expect(html).toContain("max-h-")
    expect(html).toContain("overflow-y-auto")
    expect(html).not.toContain("Thought for")
  })

  it("keeps streaming thinking content in a fixed scrollable panel", () => {
    const thinking = tenThinkingLines()
    const html = renderToStaticMarkup(<StreamingMessage content={`<think>\n${thinking}`} />)

    expect(html).toContain("stage line 1")
    expect(html).toContain("stage line 10")
    expect(html).not.toContain("h-[5lh]")
    expect(html).toContain("max-h-")
    expect(html).toContain("overflow-y-auto")
  })
})

describe("deep chapter thinking toggle style", () => {
  it("uses a clear dark selected state when deep chapter generation is enabled", () => {
    const activeClassName = getDeepChapterToggleButtonClass(true)
    const inactiveClassName = getDeepChapterToggleButtonClass(false)

    expect(activeClassName).toContain("bg-primary")
    expect(activeClassName).toContain("text-primary-foreground")
    expect(activeClassName).toContain("border-primary")
    expect(inactiveClassName).not.toContain("bg-primary")
  })
})

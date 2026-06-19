import { describe, expect, it } from "vitest"
import { buildRevisionDirectives } from "./revision-feedback"

describe("buildRevisionDirectives", () => {
  it("treats missing or malformed feedback as empty", () => {
    expect(buildRevisionDirectives(undefined)).toBe("")
    expect(buildRevisionDirectives(null)).toBe("")
    expect(buildRevisionDirectives([] as any)).toBe("")
    expect(buildRevisionDirectives({ mustFix: [1, ""] } as any)).toBe("")
  })

  it("normalizes partial feedback before building directives", () => {
    const text = buildRevisionDirectives({
      mustFix: ["  keep this clue consistent  ", "keep this clue consistent"],
    })

    expect(text).toContain("keep this clue consistent")
    expect(text.match(/keep this clue consistent/g)).toHaveLength(1)
  })
})

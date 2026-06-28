import { describe, expect, it } from "vitest"
import { clampResizableInputHeight, getResizeBoundsForElement, resolveMaxHeightFromContext, DEFAULT_RESIZABLE_INPUT_HEIGHT } from "./chat-input-resize"

describe("chat input resize bounds", () => {
  it("keeps the input height between the default height and max height", () => {
    expect(clampResizableInputHeight(20, { minHeight: 44, maxHeight: 300 })).toBe(44)
    expect(clampResizableInputHeight(180, { minHeight: 44, maxHeight: 300 })).toBe(180)
    expect(clampResizableInputHeight(500, { minHeight: 44, maxHeight: 300 })).toBe(300)
  })

  it("clamps invalid finite values to min height", () => {
    expect(clampResizableInputHeight(Number.NaN, { minHeight: 44, maxHeight: 300 })).toBe(44)
    expect(clampResizableInputHeight(Number.POSITIVE_INFINITY, { minHeight: 44, maxHeight: 300 })).toBe(300)
  })

  it("returns safe defaults when element is null", () => {
    const bounds = getResizeBoundsForElement(null)
    expect(bounds.minHeight).toBe(DEFAULT_RESIZABLE_INPUT_HEIGHT)
    expect(bounds.maxHeight).toBeGreaterThanOrEqual(DEFAULT_RESIZABLE_INPUT_HEIGHT)
  })

  it("predicts max height from context allowing upward expansion", () => {
    const ctx = {
      startRootTop: 680,
      startRootHeight: 120,
      startInputHeight: 44,
      viewportHeight: 800,
      containerHeight: 700,
      fixedOverhead: 76,
    }
    const initialMax = resolveMaxHeightFromContext(ctx, 44)
    expect(initialMax).toBeGreaterThan(44)
    const expandedMax = resolveMaxHeightFromContext(ctx, 200)
    expect(expandedMax).toBeGreaterThan(initialMax)
  })
})

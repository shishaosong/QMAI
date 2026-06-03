// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { WikiEditor } from "./wiki-editor"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("WikiEditor immersive writing", () => {
  it("prevents the writing textarea from creating a second scrollbar", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <WikiEditor
          content={"# 第1章\n\n这是一段正文。"}
          onSave={() => {}}
          immersiveWriting
        />,
      )
    })

    const textarea = container.querySelector("textarea")
    expect(textarea).not.toBeNull()
    expect(textarea?.className).toContain("overflow-hidden")

    act(() => root.unmount())
    document.body.removeChild(container)
  })
})

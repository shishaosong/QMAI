// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { formatChapterWriting } from "@/lib/chapter-formatting"
import { WikiEditor } from "./wiki-editor"

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function nextFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

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

  it("keeps typing on the inserted line after the parent normalizes chapter content", async () => {
    function ControlledEditor() {
      const [content, setContent] = useState("# 第4章\n\n这个是怎么回事呢?")
      return (
        <WikiEditor
          content={content}
          onSave={(markdown) => setContent(formatChapterWriting(markdown))}
          immersiveWriting
        />
      )
    }

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<ControlledEditor />)
      await nextFrame()
    })

    const textarea = container.querySelector("textarea")
    expect(textarea).not.toBeNull()
    if (!textarea) throw new Error("textarea not found")

    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
      await nextFrame()
    })

    const insertedLineStart = textarea.value.lastIndexOf("\n") + 1
    expect(insertedLineStart).toBeGreaterThan(0)

    await act(async () => {
      const caret = textarea.selectionStart
      setTextareaValue(textarea, `${textarea.value.slice(0, caret)}雄${textarea.value.slice(textarea.selectionEnd)}`)
      await nextFrame()
    })

    const lines = textarea.value.split("\n")
    expect(lines[0]).toBe("这个是怎么回事呢?")
    expect(lines[lines.length - 1]).toContain("雄")
    expect(textarea.selectionStart).toBeGreaterThan(insertedLineStart)

    act(() => root.unmount())
    document.body.removeChild(container)
  })

  it("preserves the reading scroll position while editing chapter body", async () => {
    const lines = Array.from({ length: 80 }, (_, index) => `第${index + 1}行正文内容`)

    function ControlledEditor() {
      const [content, setContent] = useState(`# 第1章\n\n${lines.join("\n")}`)
      return (
        <div data-scroll-root style={{ height: "200px", overflowY: "auto" }}>
          <WikiEditor
            content={content}
            onSave={(markdown) => setContent(formatChapterWriting(markdown))}
            immersiveWriting
          />
        </div>
      )
    }

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<ControlledEditor />)
      await nextFrame()
    })

    const scrollRoot = container.querySelector("[data-scroll-root]") as HTMLDivElement | null
    const textarea = container.querySelector("textarea")
    expect(scrollRoot).not.toBeNull()
    expect(textarea).not.toBeNull()
    if (!scrollRoot || !textarea) throw new Error("editor not found")

    scrollRoot.scrollTop = 420
    textarea.focus()
    const editAt = textarea.value.indexOf("第40行")
    textarea.setSelectionRange(editAt, editAt)

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }))
      scrollRoot.scrollTop = 777
      setTextareaValue(textarea, `${textarea.value.slice(0, editAt)}修改后的${textarea.value.slice(editAt)}`)
      await nextFrame()
      await nextFrame()
    })

    expect(scrollRoot.scrollTop).toBe(420)

    act(() => root.unmount())
    document.body.removeChild(container)
  })

  it("does not scroll to the beginning after deleting a line while editing", async () => {
    const lines = Array.from({ length: 80 }, (_, index) => `line-${index + 1} body`)
    const originalFocus = HTMLTextAreaElement.prototype.focus

    function ControlledEditor() {
      const [content, setContent] = useState(`# Chapter\n\n${lines.join("\n")}`)
      return (
        <div data-scroll-root style={{ height: "200px", overflowY: "auto" }}>
          <WikiEditor
            content={content}
            onSave={(markdown) => setContent(formatChapterWriting(markdown))}
            immersiveWriting
          />
        </div>
      )
    }

    HTMLTextAreaElement.prototype.focus = function focus(options?: FocusOptions) {
      originalFocus.call(this)
      if (!options?.preventScroll) {
        const scrollRoot = this.closest("[data-scroll-root]") as HTMLDivElement | null
        if (scrollRoot) scrollRoot.scrollTop = 0
      }
    }

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(<ControlledEditor />)
        await nextFrame()
      })

      const scrollRoot = container.querySelector("[data-scroll-root]") as HTMLDivElement | null
      const textarea = container.querySelector("textarea")
      expect(scrollRoot).not.toBeNull()
      expect(textarea).not.toBeNull()
      if (!scrollRoot || !textarea) throw new Error("editor not found")

      textarea.focus()
      scrollRoot.scrollTop = 520

      const lineStart = textarea.value.indexOf("line-40")
      expect(lineStart).toBeGreaterThanOrEqual(0)
      const lineEnd = textarea.value.indexOf("\n", lineStart)
      const deleteEnd = lineEnd >= 0 ? lineEnd + 1 : textarea.value.length
      textarea.setSelectionRange(lineStart, deleteEnd)

      await act(async () => {
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }))
        setTextareaValue(textarea, `${textarea.value.slice(0, lineStart)}${textarea.value.slice(deleteEnd)}`)
        await nextFrame()
        await nextFrame()
      })

      expect(scrollRoot.scrollTop).toBe(520)
    } finally {
      act(() => root.unmount())
      document.body.removeChild(container)
      HTMLTextAreaElement.prototype.focus = originalFocus
    }
  })
})

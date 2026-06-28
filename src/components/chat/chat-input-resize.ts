export const DEFAULT_RESIZABLE_INPUT_HEIGHT = 44
const INPUT_BOTTOM_RESERVED = 80
const MIN_MESSAGE_AREA_MIN = 80
const MIN_MESSAGE_AREA_RATIO = 0.15

export interface ResizableInputBounds {
  minHeight: number
  maxHeight: number
}

export interface ResizeContext {
  startRootTop: number
  startRootHeight: number
  startInputHeight: number
  viewportHeight: number
  containerHeight: number
  fixedOverhead: number
}

function computeMinMessageAreaHeight(containerHeight: number): number {
  return Math.max(MIN_MESSAGE_AREA_MIN, Math.floor(containerHeight * MIN_MESSAGE_AREA_RATIO))
}

export function createResizeContext(rootEl: HTMLDivElement | null, currentInputHeight: number): ResizeContext | null {
  if (!rootEl) return null
  const rootRect = rootEl.getBoundingClientRect()
  const containerEl = findChatContainer(rootEl)
  const containerRect = containerEl?.getBoundingClientRect()
  const containerHeight = containerRect?.height ?? window.innerHeight
  const textareaEl = rootEl.querySelector("textarea")
  const textareaRect = textareaEl?.getBoundingClientRect()
  const actualTextareaHeight = textareaRect?.height ?? currentInputHeight
  const chatInputOverhead = Math.max(0, rootRect.height - actualTextareaHeight)
  const siblingOverhead = computeSiblingOverhead(rootEl, containerEl)
  return {
    startRootTop: rootRect.top,
    startRootHeight: rootRect.height,
    startInputHeight: currentInputHeight,
    viewportHeight: window.innerHeight,
    containerHeight,
    fixedOverhead: chatInputOverhead + siblingOverhead,
  }
}

export function findChatContainer(root: HTMLDivElement): HTMLElement | null {
  let current: HTMLElement | null = root.parentElement
  let fallback: HTMLElement | null = null
  for (let i = 0; i < 8 && current; i++) {
    const tag = current.tagName
    if (tag === "BODY" || tag === "HTML") break
    const style = window.getComputedStyle(current)
    const isFlexColumn = style.display === "flex" && style.flexDirection === "column"
    if (isFlexColumn) {
      const hasConstrainedHeight = style.height !== "auto" && style.height !== ""
      const hasOverflowClip = style.overflowY === "hidden" || style.overflowY === "auto" || style.overflowY === "scroll"
      if (hasConstrainedHeight || hasOverflowClip) {
        return current
      }
      if (!fallback) {
        fallback = current
      }
    }
    current = current.parentElement
  }
  return fallback ?? root.parentElement
}

/**
 * 计算 ChatInput 根 div 之前的所有非 flex-grow 兄弟元素总高度。
 * 用于在 maxHeight 计算中扣除 Header、Section 按钮区等外层固定开销，
 * 防止 textarea 被允许拉高到超出容器实际可用空间。
 */
function computeSiblingOverhead(rootEl: HTMLDivElement, container: HTMLElement | null): number {
  if (!container) return 0
  let overhead = 0
  let found = false
  for (const child of Array.from(container.children)) {
    if (child === rootEl || (child as HTMLElement).contains(rootEl)) {
      found = true
      break
    }
    const style = window.getComputedStyle(child as HTMLElement)
    const flexGrow = parseFloat(style.flexGrow || "0")
    // 跳过 flex-grow > 0 的元素（如 messages 区域 flex-1，会自适应）
    if (flexGrow > 0) continue
    const rect = (child as HTMLElement).getBoundingClientRect()
    overhead += rect.height
  }
  return found ? overhead : 0
}

export function resolveMaxHeightFromContext(ctx: ResizeContext, nextHeight: number): number {
  const predictedRootTop = ctx.startRootTop - (nextHeight - ctx.startInputHeight)
  const viewportAvailable = ctx.viewportHeight - predictedRootTop - INPUT_BOTTOM_RESERVED
  const minMessageArea = computeMinMessageAreaHeight(ctx.containerHeight)
  const containerAvailable = ctx.containerHeight - minMessageArea - ctx.fixedOverhead
  const effectiveMax = Math.min(
    Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(viewportAvailable)),
    Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(containerAvailable)),
  )
  return effectiveMax
}

export function getResizeBoundsForElement(rootEl: HTMLDivElement | null): ResizableInputBounds {
  if (!rootEl) {
    return { minHeight: DEFAULT_RESIZABLE_INPUT_HEIGHT, maxHeight: 200 }
  }
  const containerEl = findChatContainer(rootEl)
  const containerRect = containerEl?.getBoundingClientRect()
  const containerHeight = containerRect?.height ?? window.innerHeight
  const rootRect = rootEl.getBoundingClientRect()
  const textareaEl = rootEl.querySelector("textarea")
  const textareaHeight = textareaEl?.getBoundingClientRect().height ?? DEFAULT_RESIZABLE_INPUT_HEIGHT
  const chatInputOverhead = Math.max(0, rootRect.height - textareaHeight)
  const siblingOverhead = computeSiblingOverhead(rootEl, containerEl)
  const minMessageArea = computeMinMessageAreaHeight(containerHeight)
  const containerMax = Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(containerHeight - minMessageArea - chatInputOverhead - siblingOverhead))
  const viewportMax = Math.max(DEFAULT_RESIZABLE_INPUT_HEIGHT, Math.floor(window.innerHeight - rootRect.top - INPUT_BOTTOM_RESERVED))
  return {
    minHeight: DEFAULT_RESIZABLE_INPUT_HEIGHT,
    maxHeight: Math.min(containerMax, viewportMax),
  }
}

export function clampResizableInputHeight(
  nextHeight: number,
  bounds: ResizableInputBounds,
): number {
  const minHeight = Math.max(1, Math.floor(bounds.minHeight))
  const maxHeight = Math.max(minHeight, Math.floor(bounds.maxHeight))
  if (!Number.isFinite(nextHeight)) return minHeight
  return Math.min(maxHeight, Math.max(minHeight, Math.round(nextHeight)))
}

export function isHeightAtMax(currentHeight: number, bounds: ResizableInputBounds): boolean {
  const maxHeight = Math.max(bounds.minHeight, Math.floor(bounds.maxHeight))
  return currentHeight >= maxHeight - 1
}

export function isHeightAtMin(currentHeight: number, bounds: ResizableInputBounds): boolean {
  return currentHeight <= bounds.minHeight + 1
}

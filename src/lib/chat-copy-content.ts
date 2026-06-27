import { parseAgentResponse } from "@/lib/novel/agent-parser"
import { cleanGeneratedChapterContentForSave } from "@/lib/novel/chapter-content-cleanup"

function stripHiddenAssistantBlocks(content: string): string {
  let result = content
    .replace(/<!--.*?-->/gs, "")

  // 1. 移除完整的 <think>...</think> 或 <thinking>...</thinking> 块
  result = result.replace(/<think(?:ing)?>\s*[\s\S]*?<\/think(?:ing)?>\s*/gi, "")

  // 2. 移除未闭合的开头思考块（有 <think> 但没有 </think>）
  result = result.replace(/<think(?:ing)?>\s*[\s\S]*$/gi, "")

  // 3. 移除只有结尾标签的情况：如果内容开头到第一个 </think> 之间没有 <think> 开头标签，
  //    说明思考内容直接输出在了正文前面，需要一并移除
  const firstCloseIndex = result.search(/<\/think(?:ing)?>/i)
  if (firstCloseIndex >= 0) {
    const beforeClose = result.slice(0, firstCloseIndex)
    if (!/<think(?:ing)?>/i.test(beforeClose)) {
      // 前面没有开头标签，把开头到第一个结尾标签都删掉
      result = result.replace(/^[\s\S]*?<\/think(?:ing)?>\s*/i, "")
    }
  }

  return result.trim()
}

function isChapterEditPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase()
  return normalized.startsWith("wiki/chapters/") && normalized.endsWith(".md")
}

export function getCopyableAssistantContent(content: string): string {
  const parsed = parseAgentResponse(content)
  const chapterEditReplacements = parsed.edits
    .filter((edit) => isChapterEditPath(edit.filePath) && edit.replace.trim())
    .map((edit) => cleanGeneratedChapterContentForSave(edit.replace).trim())
    .filter(Boolean)

  if (chapterEditReplacements.length > 0) {
    return chapterEditReplacements.join("\n\n").trim()
  }

  return stripHiddenAssistantBlocks(parsed.textContent || content)
}

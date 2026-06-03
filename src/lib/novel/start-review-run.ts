import type { TFunction } from "i18next"
import { parseFrontmatter } from "@/lib/frontmatter"
import { parseChapterMeta } from "@/lib/novel/chapter-meta"
import { reviewChapter } from "@/lib/novel/review-adapter"
import { persistRevisionFeedbackForChapter, pickRevisionFeedbackFromReviewResults } from "@/lib/novel/revision-feedback"
import { saveGenerationHistoryEntry } from "@/lib/novel/generation-history"
import { useWikiStore } from "@/stores/wiki-store"

interface StartNovelReviewRunArgs {
  fileContent: string
  projectPath: string
  selectedFile: string
  t: TFunction
  onHistorySaved?: () => Promise<void> | void
}

export async function startNovelReviewRun({
  fileContent,
  projectPath,
  selectedFile,
  t,
  onHistorySaved,
}: StartNovelReviewRunArgs): Promise<void> {
  if (!selectedFile || !fileContent.trim()) return

  const parsed = parseFrontmatter(fileContent)
  const meta = parsed.frontmatter ? parseChapterMeta(parsed.frontmatter as Record<string, unknown>) : null
  const runId = `${Date.now()}-${Math.random()}`
  useWikiStore.getState().setReviewRun({ runId, projectPath, filePath: selectedFile, running: true, results: [] })

  try {
    const results = await reviewChapter(projectPath, fileContent, meta?.chapterNumber, {
      onThinking: (thinking) => {
        useWikiStore.getState().finishReviewRun(runId, { running: true, thinking })
      },
    })
    useWikiStore.getState().finishReviewRun(runId, { running: true, results, error: undefined })
    await saveGenerationHistoryEntry(projectPath, {
      kind: "review",
      title: meta?.chapterNumber ? t("novel.review.historyEntryTitle", { chapter: meta.chapterNumber }) : t("novel.review.historyEntryTitleNoChapter"),
      chapterNumber: meta?.chapterNumber,
      sourcePath: selectedFile,
      results,
    })
    await onHistorySaved?.()

    if (meta?.chapterNumber) {
      await persistRevisionFeedbackForChapter(
        projectPath,
        meta.chapterNumber,
        "review",
        pickRevisionFeedbackFromReviewResults(results),
      )
    }
  } catch (error) {
    console.error("审查失败:", error)
    useWikiStore.getState().finishReviewRun(runId, { running: false, error: t("novel.review.runFailed") })
  } finally {
    const current = useWikiStore.getState().reviewRun
    if (current?.runId === runId) {
      useWikiStore.getState().finishReviewRun(runId, { running: false, results: current.results })
    }
  }
}

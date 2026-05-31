import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  FileText,
  RefreshCw,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { readFile } from "@/commands/fs"
import { WikiReader } from "@/components/editor/wiki-reader"
import { parseFrontmatter } from "@/lib/frontmatter"
import { useWikiStore } from "@/stores/wiki-store"
import {
  loadMemoryCenterData,
  type MemoryCenterSnapshotCard,
} from "@/lib/novel/memory-center"

const FILE_LABEL_KEYS: Record<string, string> = {
  "character-states": "novel.memoryCenter.sections.characterStates",
  "character-cognition": "novel.memoryCenter.sections.cognition",
  "foreshadowing-tracker": "novel.memoryCenter.sections.foreshadowing",
  timeline: "novel.memoryCenter.sections.timeline",
  "canon-facts": "novel.memoryCenter.sections.canonFacts",
  conflicts: "novel.memoryCenter.sections.conflicts",
}

type MemoryCenterDetailView =
  | {
      kind: "snapshotList"
      title: string
      description: string
      cards: MemoryCenterSnapshotCard[]
      parentView: MemoryCenterDetailView | null
    }
  | {
      kind: "markdown"
      title: string
      description: string
      content: string
      parentView: MemoryCenterDetailView | null
    }

function renderableBody(markdown: string): string {
  const parsed = parseFrontmatter(markdown)
  return parsed.rawBlock ? parsed.body : markdown
}

function SnapshotCard({
  card,
  buttonId,
  onOpen,
  t,
}: {
  card: MemoryCenterSnapshotCard
  buttonId: string
  onOpen: (path: string, title: string, focusId: string) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {card.chapterTitle || t("novel.memoryCenter.snapshots.chapter", { chapter: card.chapterNumber })}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {card.memorySynced
              ? t("novel.memoryCenter.snapshots.synced")
              : t("novel.memoryCenter.snapshots.unsynced")}
          </div>
        </div>
        <Button
          id={buttonId}
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onOpen(
              card.snapshotPath,
              card.chapterTitle || t("novel.memoryCenter.snapshots.chapter", { chapter: card.chapterNumber }),
              buttonId,
            )
          }
        >
          {t("novel.memoryCenter.snapshots.openSnapshot")}
        </Button>
      </div>

      <p className="mt-3 text-sm leading-6 text-foreground">
        {card.summary || t("novel.memoryCenter.snapshots.summaryFallback")}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SnapshotList
          title={t("novel.snapshot.characterStateChanges")}
          items={card.characterStateChanges}
          hasMore={card.hasMoreCharacterStateChanges}
        />
        <SnapshotList
          title={t("novel.snapshot.knowledgeChanges")}
          items={card.knowledgeChanges}
          hasMore={card.hasMoreKnowledgeChanges}
        />
        <SnapshotList
          title={t("novel.snapshot.foreshadowingChanges")}
          items={card.foreshadowingChanges}
          hasMore={card.hasMoreForeshadowingChanges}
        />
        <SnapshotList
          title={t("novel.snapshot.timelineEvents")}
          items={card.timelineEvents}
          hasMore={card.hasMoreTimelineEvents}
        />
      </div>

      {card.endingHook ? (
        <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("novel.snapshot.endingHook")}：</span>
          {card.endingHook}
        </div>
      ) : null}
    </div>
  )
}

function SnapshotList({
  title,
  items,
  hasMore,
}: {
  title: string
  items: string[]
  hasMore: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="mt-1 space-y-1 text-xs text-foreground">
        {items.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
        {hasMore ? <li className="text-muted-foreground">…</li> : null}
      </ul>
    </div>
  )
}

export function MemoryCenterView() {
  const { t } = useTranslation()
  const project = useWikiStore((s) => s.project)
  const selectedMemoryCenterEntry = useWikiStore((s) => s.selectedMemoryCenterEntry)
  const setSelectedMemoryCenterEntry = useWikiStore((s) => s.setSelectedMemoryCenterEntry)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailView, setDetailView] = useState<MemoryCenterDetailView | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const restoreScrollTop = useRef(0)
  const restoreFocusId = useRef<string | null>(null)
  const shouldRestorePosition = useRef(false)

  const refresh = useCallback(async () => {
    if (!project?.path || !selectedMemoryCenterEntry) {
      setError(null)
      setDetailView(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setDetailView(null)
    try {
      const memoryData = await loadMemoryCenterData(project.path)

      if (selectedMemoryCenterEntry === "snapshots") {
        setDetailView({
          kind: "snapshotList",
          title: t("novel.memoryCenter.snapshots.title"),
          description: t("novel.memoryCenter.snapshots.listDescription"),
          cards: memoryData.snapshots,
          parentView: null,
        })
        return
      }

      const file = memoryData.files.find((item) => item.key === selectedMemoryCenterEntry)
      if (!file) {
        setDetailView(null)
        return
      }

      const labelKey = FILE_LABEL_KEYS[file.key] ?? "novel.memoryCenter.openFile"
      const content = await readFile(file.path)
      setDetailView({
        kind: "markdown",
        title: t(labelKey),
        description: t("novel.memoryCenter.fileDetailDescription"),
        content: renderableBody(content),
        parentView: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [project?.path, selectedMemoryCenterEntry, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (detailView || !shouldRestorePosition.current) return
    shouldRestorePosition.current = false
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (container) {
        container.scrollTop = restoreScrollTop.current
      }

      if (!restoreFocusId.current) return
      const target = document.getElementById(restoreFocusId.current)
      if (!(target instanceof HTMLElement)) return
      target.scrollIntoView({ block: "center" })
      target.focus({ preventScroll: true })
    })
  }, [detailView])

  const rememberOpenLocation = useCallback((focusId: string) => {
    restoreScrollTop.current = scrollContainerRef.current?.scrollTop ?? 0
    restoreFocusId.current = focusId
  }, [])

  const openMarkdownDetail = useCallback(async (
    path: string,
    title: string,
    description: string,
    focusId: string,
  ) => {
    const parentView = detailView?.kind === "snapshotList" ? detailView : null
    rememberOpenLocation(focusId)
    setError(null)
    try {
      const content = await readFile(path)
      setDetailView({
        kind: "markdown",
        title,
        description,
        content: renderableBody(content),
        parentView,
      })
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo({ top: 0 })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [detailView, rememberOpenLocation])

  const openSnapshotDetail = useCallback((path: string, title: string, focusId: string) => {
    void openMarkdownDetail(
      path,
      title,
      t("novel.memoryCenter.snapshots.detailDescription"),
      focusId,
    )
  }, [openMarkdownDetail, t])

  const closeDetail = useCallback(() => {
    if (detailView?.parentView) {
      setDetailView(detailView.parentView)
      return
    }
    shouldRestorePosition.current = true
    setDetailView(null)
    setSelectedMemoryCenterEntry(null)
  }, [detailView, setSelectedMemoryCenterEntry])

  if (loading && selectedMemoryCenterEntry && !detailView) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        {t("novel.memoryCenter.loading")}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {detailView?.title ?? t("novel.memoryCenter.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {detailView?.description ?? t("novel.memoryCenter.description")}
          </p>
        </div>
        {detailView ? (
          <Button
            id="memory-center-close-detail"
            size="sm"
            variant="outline"
            onClick={closeDetail}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            {t("novel.memoryCenter.closeDetail")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("novel.memoryCenter.refresh")}
          </Button>
        )}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!selectedMemoryCenterEntry ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8 text-muted-foreground/30" />
            <p>{t("novel.memoryCenter.selectPrompt")}</p>
            <p className="text-xs">{t("novel.memoryCenter.selectHint")}</p>
          </div>
        ) : detailView ? (
          <MemoryCenterDetailPanel
            detailView={detailView}
            onOpenSnapshot={openSnapshotDetail}
            t={t}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            {t("novel.memoryCenter.loading")}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoryCenterDetailPanel({
  detailView,
  onOpenSnapshot,
  t,
}: {
  detailView: MemoryCenterDetailView
  onOpenSnapshot: (path: string, title: string, focusId: string) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  if (detailView.kind === "snapshotList") {
    return (
      <div className="space-y-3">
        {detailView.cards.map((card) => (
          <SnapshotCard
            key={card.chapterNumber}
            card={card}
            buttonId={`memory-center-detail-snapshot-${card.chapterNumber}`}
            onOpen={onOpenSnapshot}
            t={t}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-background p-4">
      <WikiReader body={detailView.content} />
    </div>
  )
}

# Memory Sync Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI chapter generation read only the latest effective novel memory after snapshot extraction or memory sync, while keeping historical snapshots available for audit and rollback.

**Architecture:** Keep `.novel/snapshots/*.snapshot.json` as the current truth for each chapter or outline, and keep `.novel/snapshots/history/*` as archive-only history. Add lightweight revision metadata to snapshots, rebuild current projection files from the latest snapshot, and tighten context retrieval so AI generation reads authoritative current projections instead of stale query logs or historical artifacts.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tauri file APIs, i18next

---

## File Map

- `src/lib/novel/chapter-ingest.ts`
  - Current snapshot save/sync/restore pipeline.
  - Will own revision metadata, archive markers, projection refresh orchestration, and rollback rebuild.
- `src/lib/novel/graph-adapter.ts`
  - Writes entity and concept pages from snapshots.
  - Will need source-aware cleanup and metadata persistence on projection pages.
- `src/lib/novel/context-engine.ts`
  - Builds AI writing context.
  - Will switch generation-time retrieval to current effective sources only.
- `src/lib/novel/search-adapter.ts`
  - Mixed retrieval used by novel context.
  - Will filter or downgrade non-authoritative sources such as `queries/` and historical traces for generation context.
- `src/lib/graph-relevance.ts`
  - Builds the retrieval graph from wiki pages.
  - Will skip historical or inactive projection nodes if they remain on disk.
- `src/components/novel/snapshot-viewer.tsx`
  - Snapshot history and rollback UI.
  - Will keep history visible while clarifying that archived versions are not used by default generation.
- `src/i18n/zh.json`
- `src/i18n/en.json`
  - Minimal UI copy for rollback, sync warnings, and current/history language.
- `src/lib/novel/chapter-ingest.sync.test.ts`
  - Focused sync regression tests.
- `src/lib/novel/graph-adapter.test.ts`
  - Projection page write/cleanup assertions.
- `src/lib/novel/search-adapter.test.ts`
  - Retrieval-source filtering and ranking assertions.
- `src/lib/novel/novel.test.ts`
  - End-to-end context pack regression coverage.

---

### Task 1: Add snapshot revision metadata and active/history rules

**Files:**
- Modify: `src/lib/novel/chapter-ingest.ts`
- Test: `src/lib/novel/chapter-ingest.sync.test.ts`
- Test: `src/lib/novel/novel.test.ts`

- [ ] **Step 1: Write failing tests for revision metadata on current snapshots and history restores**

Add tests that lock in:
- `syncSnapshotToMemory()` writes `revision`, `sourceType`, `sourceSequence`, `snapshotId`, `supersedes`, and `isHistorical: false` to the current snapshot JSON.
- When a current snapshot is overwritten, the archived history copy preserves the older revision and is marked `isHistorical: true`.
- `restoreSnapshotHistory()` creates a new current revision instead of resurrecting the old revision unchanged.

```ts
it("marks overwritten snapshots as history and bumps revision on sync", async () => {
  writeTestFile("/project/.novel/snapshots/001.snapshot.json", JSON.stringify({
    ...syncedSnapshot,
    snapshotId: "chapter-1-r1",
    sourceType: "chapter",
    sourceSequence: 1,
    revision: 1,
    isHistorical: false,
  }, null, 2))

  await syncSnapshotToMemory("/project", syncedSnapshot)

  const current = JSON.parse(files.get("/project/.novel/snapshots/001.snapshot.json")!)
  expect(current.revision).toBe(2)
  expect(current.supersedes).toBe("chapter-1-r1")
  expect(current.isHistorical).toBe(false)

  const history = await listSnapshotHistory("/project", 1)
  const archived = JSON.parse(files.get(normalizePathForTest(history[0].path))!)
  expect(archived.revision).toBe(1)
  expect(archived.isHistorical).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/novel.test.ts`
Expected: FAIL because snapshot metadata and restore semantics do not exist yet.

- [ ] **Step 3: Implement the minimal revision metadata flow in `chapter-ingest.ts`**

Add lightweight metadata fields to `ChapterSnapshot` and normalize them at load/save time.

```ts
export interface ChapterSnapshot {
  chapterId: string
  chapterNumber: number
  chapterTitle?: string
  summary: string
  characters: string[]
  locations: string[]
  organizations: string[]
  items: string[]
  events: string[]
  characterStateChanges: string[]
  relationshipChanges: string[]
  knowledgeChanges: string[]
  foreshadowingChanges: string[]
  newCanonFacts: string[]
  timelineEvents: string[]
  conflicts: string[]
  endingHook: string
  graphNodes: string[]
  graphEdges: string[]
  sourceType?: "chapter" | "outline"
  sourceSequence?: number
  revision?: number
  snapshotId?: string
  supersedes?: string
  isHistorical?: boolean
  memorySyncedAt?: string
}
```

Use helpers inside `chapter-ingest.ts` to keep the rules consistent:

```ts
function inferSnapshotSourceType(snapshot: ChapterSnapshot): "chapter" | "outline" {
  return snapshot.chapterNumber < 0 ? "outline" : "chapter"
}

function inferSnapshotSourceSequence(snapshot: ChapterSnapshot): number {
  return Math.abs(snapshot.chapterNumber)
}

function nextSnapshotRevision(current: ChapterSnapshot | null): number {
  return current?.revision && current.revision > 0 ? current.revision + 1 : 1
}
```

When archiving an overwritten snapshot, rewrite the archived JSON with `isHistorical: true` before writing it to `.novel/snapshots/history/...`.

- [ ] **Step 4: Re-run the focused tests**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/novel.test.ts`
Expected: PASS for the new revision/history assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel/chapter-ingest.ts src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/novel.test.ts
git commit -m "fix: add snapshot revision metadata"
```

---

### Task 2: Rebuild current projection pages and delete stale projection artifacts

**Files:**
- Modify: `src/lib/novel/chapter-ingest.ts`
- Modify: `src/lib/novel/graph-adapter.ts`
- Test: `src/lib/novel/chapter-ingest.sync.test.ts`
- Test: `src/lib/novel/graph-adapter.test.ts`

- [ ] **Step 1: Write failing tests for source-aware projection cleanup**

Add tests that prove:
- Updating a snapshot from `"手机"` to new content rewrites the current entity or concept projection.
- Projection files that are only sourced from the superseded snapshot are removed.
- Projection files that are still referenced by the new snapshot remain.

```ts
it("removes stale projection pages that only belong to the superseded snapshot", async () => {
  writeTestFile("/project/wiki/entities/mobile-phone.md", [
    "---",
    "type: entity",
    'title: "手机"',
    'snapshot_id: "chapter-1-r1"',
    'sources: ["001.snapshot.json"]',
    "---",
    "",
    "# 手机",
  ].join("\n"))

  await syncSnapshotToMemory("/project", syncedSnapshotWithoutPhone)

  expect(files.has("/project/wiki/entities/mobile-phone.md")).toBe(false)
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/graph-adapter.test.ts`
Expected: FAIL because projection metadata and cleanup rules are incomplete.

- [ ] **Step 3: Persist source metadata on projection pages and use it during cleanup**

Update `writeSnapshotToWiki()` so each generated entity or concept page carries enough metadata to identify the current snapshot source.

```ts
const snapshotMeta = {
  snapshotId: canonicalSnapshot.snapshotId ?? `${canonicalSnapshot.chapterId}-r${canonicalSnapshot.revision ?? 1}`,
  sourceType: canonicalSnapshot.sourceType ?? inferSnapshotSourceType(canonicalSnapshot),
  sourceSequence: canonicalSnapshot.sourceSequence ?? Math.abs(canonicalSnapshot.chapterNumber),
  revision: canonicalSnapshot.revision ?? 1,
  isHistorical: false,
}
```

Frontmatter written to projection pages should include:

```md
---
type: entity
title: "灵石"
snapshot_id: "chapter-1-r2"
source_type: "chapter"
source_sequence: 1
source_revision: 2
is_historical: false
sources: ["001.snapshot.json"]
---
```

Then add a cleanup pass in `syncSnapshotToMemory()`:

```ts
async function removeSupersededProjectionFiles(
  projectPath: string,
  currentSnapshot: ChapterSnapshot,
  writtenPaths: string[],
): Promise<void> {
  // Scan authoritative projection folders only.
  // Delete files whose frontmatter points only to currentSnapshot.supersedes.
}
```

Restrict cleanup to authoritative projection folders:
- `wiki/entities`
- `wiki/concepts`
- `wiki/memory`

Do not delete:
- `wiki/queries`
- `wiki/sources`
- user-authored non-generated pages

- [ ] **Step 4: Re-run the focused tests**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/graph-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel/chapter-ingest.ts src/lib/novel/graph-adapter.ts src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/graph-adapter.test.ts
git commit -m "fix: rebuild current projections from latest snapshot"
```

---

### Task 3: Restrict AI generation retrieval to authoritative current-memory sources

**Files:**
- Modify: `src/lib/novel/context-engine.ts`
- Modify: `src/lib/novel/search-adapter.ts`
- Modify: `src/lib/graph-relevance.ts`
- Test: `src/lib/novel/search-adapter.test.ts`
- Test: `src/lib/novel/novel.test.ts`

- [ ] **Step 1: Write failing tests for stale-source exclusion in generation retrieval**

Add tests that show:
- `novelMixedSearch()` does not return `wiki/queries/...` for generation context when an authoritative entity or memory page answers the same query.
- `buildContextPack()` prefers current entity, concept, memory, canon, and recent chapter sources.
- Historical or archived projection pages are skipped by graph retrieval.

```ts
it("excludes query-log pages from generation retrieval when authoritative memory exists", async () => {
  mockSearchWiki.mockResolvedValue([
    searchHit("/project/wiki/queries/old-phone-query.md", "旧查询", 0.95),
    searchHit("/project/wiki/entities/spirit-stone.md", "灵石", 0.70),
  ])

  const results = await novelMixedSearch({
    projectPath: "/project",
    query: "写第10章 灵石",
    topK: 3,
    includeKeyword: true,
    includeVector: false,
    includeGraph: false,
    includeRecentChapters: true,
    includeCanon: true,
  })

  expect(results.map((item) => item.path)).not.toContain("/project/wiki/queries/old-phone-query.md")
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npx vitest run src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts`
Expected: FAIL because the current retrieval flow still mixes historical and query-log content.

- [ ] **Step 3: Add a source allowlist and historical filter for generation context**

Implement a narrow generation-safe source filter in `search-adapter.ts`.

```ts
function isAuthoritativeGenerationPath(path: string): boolean {
  return /\/wiki\/(entities|concepts|memory|chapters)\//.test(path)
    || /\/wiki\/canon\.md$/.test(path)
}

function isHistoricalProjectionSnippet(path: string, snippet: string): boolean {
  return /\/history\//.test(path) || /is_historical:\s*true/i.test(snippet)
}
```

Apply it before reranking in `novelMixedSearch()` for AI context callers:

```ts
const filtered = merged.filter((item) => {
  if (isHistoricalProjectionSnippet(item.path, item.snippet)) return false
  if (item.type === "keyword" || item.type === "vector" || item.type === "graph") {
    return isAuthoritativeGenerationPath(item.path)
  }
  return true
})
```

Then update `context-engine.ts` so generation context uses this filtered retrieval result as its default long-memory source. Keep recent chapter summaries and previous-ending logic unchanged.

Finally, make `graph-relevance.ts` skip nodes with frontmatter `is_historical: true` when building the retrieval graph.

- [ ] **Step 4: Re-run the focused tests**

Run: `npx vitest run src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel/context-engine.ts src/lib/novel/search-adapter.ts src/lib/graph-relevance.ts src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts
git commit -m "fix: filter stale retrieval sources from AI context"
```

---

### Task 4: Make rollback rebuild the current effective projection instead of restoring raw history only

**Files:**
- Modify: `src/lib/novel/chapter-ingest.ts`
- Modify: `src/components/novel/snapshot-viewer.tsx`
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`
- Test: `src/lib/novel/novel.test.ts`

- [ ] **Step 1: Write a failing rollback regression test**

Add a test that:
- archives v1 with `"手机"`
- updates current snapshot to v2 with `"灵石"`
- restores v1 from history
- verifies the restored current projection now contains `"手机"` again
- verifies the current revision is new and the prior v2 projection is no longer the active default source

```ts
it("rebuilds current projections when restoring snapshot history", async () => {
  const restored = await restoreSnapshotHistory("/project", 1, "2026-06-01T00-00-00-000Z.snapshot.json")
  expect(restored.revision).toBeGreaterThan(1)
  expect(await readFile("/project/wiki/entities/mobile-phone.md")).toContain("手机")
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/lib/novel/novel.test.ts`
Expected: FAIL because restore currently only overwrites the snapshot file.

- [ ] **Step 3: Rebuild projections as part of restore and update the history UI copy**

In `restoreSnapshotHistory()`:

```ts
const restoredCurrent = await materializeRestoredSnapshot(pp, archivedSnapshot)
await saveSnapshot(pp, restoredCurrent)
await writeSnapshotToWiki(pp, restoredCurrent)
await exportStructuredMemoryToWiki(pp, restoredCurrent)
clearGraphCache()
useWikiStore.getState().bumpDataVersion()
return restoredCurrent
```

Keep the UI minimal:
- keep the existing history list
- update the confirm text to explain that restoring history also rebuilds the current effective memory projection

```ts
if (!window.confirm(t("novel.snapshot.restoreRebuildConfirm"))) return
```

- [ ] **Step 4: Re-run the focused test**

Run: `npx vitest run src/lib/novel/novel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel/chapter-ingest.ts src/components/novel/snapshot-viewer.tsx src/i18n/zh.json src/i18n/en.json src/lib/novel/novel.test.ts
git commit -m "fix: rebuild effective memory on snapshot rollback"
```

---

### Task 5: Add the cross-layer "phone to new memory" regression chain

**Files:**
- Modify: `src/lib/novel/novel.test.ts`
- Modify: `src/lib/novel/chapter-ingest.sync.test.ts`
- Modify: `src/lib/novel/search-adapter.test.ts`

- [ ] **Step 1: Write one end-to-end regression that mirrors the user report**

Cover the full chain:
- initial outline or chapter snapshot writes `"手机"`
- sync writes current entity and memory projections
- the user edits the source snapshot to replace `"手机"`
- sync runs again
- `buildContextPack()` for a later chapter no longer includes `"手机"` in `searchResults` or `graphSearchResults`
- the latest replacement term appears instead

```ts
it("stops surfacing superseded phone memory after re-sync", async () => {
  const pack = await buildContextPack("/project", "写第12章，继续推进修炼体系", 12)
  expect(pack.searchResults).not.toContain("手机")
  expect(pack.graphSearchResults).not.toContain("手机")
  expect(pack.searchResults).toContain("灵石")
})
```

- [ ] **Step 2: Run the focused regression tests to verify they fail**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts`
Expected: FAIL before the full chain is implemented.

- [ ] **Step 3: Fill any missing glue code only after the failure points are explicit**

If the previous tasks leave one last integration gap, add only the minimum missing code needed to make the regression pass. Prefer wiring existing helpers over creating a new subsystem.

```ts
// Example glue only if needed:
useWikiStore.getState().bumpDataVersion()
clearGraphCache()
await refreshCurrentProjectionIndexes(pp, syncedSnapshot)
```

- [ ] **Step 4: Re-run the focused regression tests**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts
git commit -m "test: lock stale memory regression across sync and retrieval"
```

---

### Task 6: Full verification, packaging, and release-ready summary

**Files:**
- Verify only

- [ ] **Step 1: Run focused novel-memory regression tests**

Run: `npx vitest run src/lib/novel/chapter-ingest.sync.test.ts src/lib/novel/graph-adapter.test.ts src/lib/novel/search-adapter.test.ts src/lib/novel/novel.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Run broader mock baseline**

Run: `npm run test:mocks`
Expected: PASS, or document any unrelated existing failures explicitly before continuing.

- [ ] **Step 4: Rebuild the local Windows packages**

Run: `npm run build:github-release`
Expected: PASS, with refreshed artifacts under:
- `E:\QMAI\release-github`
- `E:\QMAI\release-portable`

- [ ] **Step 5: Verify the new package timestamps**

Run: `Get-ChildItem -LiteralPath 'E:\QMAI\release-github' -Force | Select-Object Name,LastWriteTime`
Expected: the `0.4.33` installer, signature, and `latest.json` show fresh timestamps from the current build.

- [ ] **Step 6: Commit**

```bash
git add src docs
git commit -m "fix: refresh AI memory retrieval from latest snapshots"
```

---

## Self-Review

### Spec coverage

- Root-cause repair: covered by Tasks 2 and 3.
- Hidden version metadata: covered by Task 1.
- History/archive separation: covered by Tasks 1, 3, and 4.
- Default latest-version retrieval: covered by Tasks 2 and 3.
- Rollback: covered by Task 4.
- Automation tests: covered by Tasks 1 through 6.
- Packaging after modification: covered by Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or "handle appropriately" placeholders remain.
- Every task has exact files and commands.
- Code-touching steps include concrete snippets or signatures.

### Type consistency

- Snapshot metadata fields are named consistently as `sourceType`, `sourceSequence`, `revision`, `snapshotId`, `supersedes`, and `isHistorical`.
- "Current effective projection" is used consistently for the active AI-readable layer.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-01-memory-sync-freshness-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

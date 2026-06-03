import { describe, expect, it, vi } from "vitest"
import type { LlmConfig } from "@/stores/wiki-store"
import type { ChatMessage, StreamCallbacks } from "@/lib/llm-client"
import type { ContextPack } from "./context-engine"
import type { NovelReviewResult } from "./review-adapter"
import {
  shouldUseDeepChapterGeneration,
  runDeepChapterGeneration,
  type DeepChapterGenerationDeps,
} from "./deep-chapter-generation"
import {
  buildDeepChapterBriefPrompt,
  buildDeepChapterDraftPrompt,
  buildDeepChapterRevisionPrompt,
  DEEP_CHAPTER_MIN_CHARS,
  DEEP_CHAPTER_TARGET_CHARS,
} from "./deep-chapter-prompts"

const llmConfig = {
  provider: "custom",
  apiKey: "test-key",
  model: "test-model",
  ollamaUrl: "",
  customEndpoint: "https://example.test/v1",
  maxContextSize: 120000,
  reasoning: { mode: "high" },
} satisfies LlmConfig

const contextPack: ContextPack = {
  task: "生成第3章",
  chapterGoal: "第3章目标：主角进入雨夜旧屋，发现第一条线索。",
  outline: "第3章：雨夜旧屋，发现线索，结尾留下危险钩子。",
  recentSummaries: ["第1章：主角收到匿名信。", "第2章：主角抵达旧城区。"],
  previousChapterEnding: "门缝里传来金属拖拽声。",
  characterStates: "主角谨慎，但急于确认真相。",
  soulDoc: "",
  characterAuras: "",
  cognitionStates: "主角不知道旧屋主人真实身份。",
  foreshadowingStates: "匿名信、锈钥匙尚未回收。",
  timeline: "雨夜，当晚十点。",
  relatedSettings: "旧屋位于停电后的城区边缘。",
  canonRules: "主角不能凭空知道旧屋主人身份。",
  writingStyle: "悬疑、克制、画面感强。",
  searchResults: "旧屋相关记忆片段。",
  graphSearchResults: "匿名信 -> 旧屋 -> 锈钥匙。",
  mustDo: "承接上一章门缝声，推进锈钥匙线索。",
  mustAvoid: "不要提前揭露旧屋主人身份。",
  nextChapterAdvice: "结尾引出屋内第二个人影。",
  revisionDirectives: "",
}

function chapterText(prefix: string, count = 3000): string {
  const scenes = [
    "雨水沿着瓦檐落下，旧屋里的灯影忽明忽暗，主角先确认门缝后的动静。",
    "他没有急着开口，而是把锈钥匙压在掌心，听见墙后传来短促的摩擦声。",
    "小晴醒来时仍有些发冷，她的回答补上了上一章留下的疑点，却也带出新的矛盾。",
    "两人沿着走廊往里走，地板下的空响让他们意识到这间屋子被人提前动过手脚。",
    "主角试探着推开柜门，里面没有想象中的尸体，只有一封被雨气浸软的旧信。",
    "信纸上的字迹和匿名信相互呼应，但关键名字被刻意刮掉，线索因此变得更危险。",
    "屋外的脚步声突然停住，像有人贴着门听他们说话，空气一下子绷紧。",
    "主角把小晴挡到身后，决定先带走信纸，却在箱底摸到第二把完全陌生的钥匙。",
  ]
  let text = prefix
  let index = 0
  while (text.length < count) {
    text += `${scenes[index % scenes.length]}第${index + 1}个细节把人物选择继续往前推。`
    index += 1
  }
  return text.slice(0, count)
}

function createDeps(reviewResults: NovelReviewResult[] = []): DeepChapterGenerationDeps {
  const responses = [
    "写作任务书内容",
    chapterText("初稿正文内容"),
    chapterText("返修正文内容"),
    chapterText("最终去AI味正文"),
  ]
  return {
    buildContextPack: vi.fn(async () => contextPack),
    contextPackToPrompt: vi.fn(() => "上下文包内容"),
    reviewChapter: vi.fn(async () => reviewResults),
    streamChat: vi.fn(async (_config: LlmConfig, messages: ChatMessage[], callbacks: StreamCallbacks) => {
      const prompt = messages.map((message) => String(message.content)).join("\n")
      const content = prompt.includes("简单审查") || prompt.includes("去AI味")
        ? responses[3]
        : prompt.includes("返修")
          ? responses[2]
          : prompt.includes("正文")
            ? responses[1]
            : responses[0]
      callbacks.onToken(content)
      callbacks.onDone()
    }),
  }
}

describe("runDeepChapterGeneration", () => {
  it("puts a hard 3000-character chapter length target into planning, draft, and revision prompts", () => {
    const reviewResults: NovelReviewResult[] = [{
      severity: "error",
      type: "plot",
      message: "测试问题",
      evidence: "",
      relatedMemory: "",
      suggestion: "",
    }]

    const prompts = [
      buildDeepChapterBriefPrompt("上下文包内容", "生成第3章", 3),
      buildDeepChapterDraftPrompt("上下文包内容", "写作任务书内容", "生成第3章", 3),
      buildDeepChapterRevisionPrompt("上下文包内容", "写作任务书内容", "初稿正文内容", reviewResults, "生成第3章", 3),
    ]

    for (const prompt of prompts) {
      expect(prompt).toContain(`约 ${DEEP_CHAPTER_TARGET_CHARS} 字`)
      expect(prompt).toContain(`低于 ${DEEP_CHAPTER_MIN_CHARS} 字`)
      expect(prompt).toContain("2800-3300 字")
    }
  })

  it("only enables deep generation for write-chapter routes when the switch is on", () => {
    expect(shouldUseDeepChapterGeneration({ intent: "write_chapter", confidence: 1, extractedParams: {} }, true)).toBe(true)
    expect(shouldUseDeepChapterGeneration({ intent: "continue_chapter", confidence: 1, extractedParams: {} }, true)).toBe(true)
    expect(shouldUseDeepChapterGeneration({ intent: "write_chapter", confidence: 1, extractedParams: {} }, false)).toBe(false)
    expect(shouldUseDeepChapterGeneration({ intent: "general_chat", confidence: 1, extractedParams: {} }, true)).toBe(true)
    expect(shouldUseDeepChapterGeneration(null, true)).toBe(true)
  })

  it("publishes stage results into thinking and returns the final simple review result when review passes", async () => {
    const deps = createDeps()
    const thinking: string[] = []

    const result = await runDeepChapterGeneration(
      { projectPath: "E:/Novel", userRequest: "生成第3章", chapterNumber: 3, llmConfig },
      { onThinking: (content) => thinking.push(content) },
      deps,
    )

    expect(result.finalContent).toContain("最终去AI味正文")
    expect(result.revised).toBe(false)
    expect(thinking.join("\n")).toContain("阶段1：上下文分析")
    expect(thinking.join("\n")).toContain("阶段2：写作任务书")
    expect(thinking.join("\n")).toContain("阶段3：正文初稿")
    expect(thinking.join("\n")).toContain("阶段4：AI审稿")
    expect(thinking.join("\n")).toContain("阶段6：简单审查与去AI味")
    expect(thinking.join("\n")).toContain("未发现阻断问题")
  })

  it("revises once when review returns blocking errors", async () => {
    const deps = createDeps([
      {
        severity: "error",
        type: "plot",
        message: "没有承接上一章门缝声。",
        evidence: "初稿正文内容",
        relatedMemory: "上一章结尾",
        suggestion: "补上门缝声的承接。",
      },
    ])
    const thinking: string[] = []

    const result = await runDeepChapterGeneration(
      { projectPath: "E:/Novel", userRequest: "生成第3章", chapterNumber: 3, llmConfig },
      { onThinking: (content) => thinking.push(content) },
      deps,
    )

    expect(result.finalContent).toContain("最终去AI味正文")
    expect(result.revised).toBe(true)
    expect(deps.streamChat).toHaveBeenCalledTimes(4)
    expect(thinking.join("\n")).toContain("阶段5：自动返修")
    expect(thinking.join("\n")).toContain("阶段6：简单审查与去AI味")
    expect(thinking.join("\n")).toContain("没有承接上一章门缝声")
  })

  it("automatically expands a too-short draft before review and final output", async () => {
    const shortDraft = chapterText("短稿", 800)
    const expandedDraft = chapterText("扩写后正文", 3000)
    const finalPolished = chapterText("最终去AI味正文", 3000)
    const deps: DeepChapterGenerationDeps = {
      buildContextPack: vi.fn(async () => contextPack),
      contextPackToPrompt: vi.fn(() => "上下文包内容"),
      reviewChapter: vi.fn(async () => []),
      streamChat: vi.fn(async (_config: LlmConfig, messages: ChatMessage[], callbacks: StreamCallbacks) => {
        const prompt = messages.map((message) => String(message.content)).join("\n")
        const content = prompt.includes("简单审查") || prompt.includes("去AI味")
          ? finalPolished
          : prompt.includes("扩写补足")
          ? expandedDraft
          : prompt.includes("章节正文")
            ? shortDraft
            : "写作任务书内容"
        callbacks.onToken(content)
        callbacks.onDone()
      }),
    }
    const thinking: string[] = []

    const result = await runDeepChapterGeneration(
      { projectPath: "E:/Novel", userRequest: "生成第3章", chapterNumber: 3, llmConfig },
      { onThinking: (content) => thinking.push(content) },
      deps,
    )

    expect(result.finalContent).toBe(finalPolished)
    expect(deps.streamChat).toHaveBeenCalledTimes(4)
    expect(deps.reviewChapter).toHaveBeenCalledWith("E:/Novel", expandedDraft, 3)
    expect(thinking.join("\n")).toContain("阶段3：正文扩写补足")
    expect(thinking.join("\n")).toContain("阶段6：简单审查与去AI味")
  })

  it("trims runaway repeated chapter output before review and final polish", async () => {
    const repeatUnit = "屋外雨声小了些，风还从门缝挤进来。旧木箱的盖子松松地合上，那东西还在。小晴在床上动了动，掌心湿热，像两股不同的水在交汇。\n"
    const runawayDraft = repeatUnit.repeat(900)
    const finalPolished = chapterText("最终去AI味正文", 3000)
    const deps: DeepChapterGenerationDeps = {
      buildContextPack: vi.fn(async () => contextPack),
      contextPackToPrompt: vi.fn(() => "上下文包内容"),
      reviewChapter: vi.fn(async () => []),
      streamChat: vi.fn(async (_config: LlmConfig, messages: ChatMessage[], callbacks: StreamCallbacks) => {
        const prompt = messages.map((message) => String(message.content)).join("\n")
        const content = prompt.includes("简单审查") || prompt.includes("去AI味")
          ? finalPolished
          : prompt.includes("章节正文")
            ? runawayDraft
            : "写作任务书内容"
        callbacks.onToken(content)
        callbacks.onDone()
      }),
    }
    const thinking: string[] = []

    const result = await runDeepChapterGeneration(
      { projectPath: "E:/Novel", userRequest: "生成第3章", chapterNumber: 3, llmConfig },
      { onThinking: (content) => thinking.push(content) },
      deps,
    )

    expect(result.draftContent.length).toBeLessThanOrEqual(4500)
    expect(result.finalContent).toBe(finalPolished)
    expect(deps.reviewChapter).toHaveBeenCalledWith("E:/Novel", expect.stringMatching(/^屋外雨声小了些/), 3)
    expect((deps.reviewChapter as ReturnType<typeof vi.fn>).mock.calls[0][1].length).toBeLessThanOrEqual(4500)
    expect(thinking.join("\n")).toContain("检测到模型重复输出")
  })

  it("stops before review when the user cancels during draft streaming", async () => {
    const controller = new AbortController()
    const deps: DeepChapterGenerationDeps = {
      buildContextPack: vi.fn(async () => contextPack),
      contextPackToPrompt: vi.fn(() => "上下文包内容"),
      reviewChapter: vi.fn(async () => []),
      streamChat: vi.fn(async (_config: LlmConfig, messages: ChatMessage[], callbacks: StreamCallbacks) => {
        const prompt = messages.map((message) => String(message.content)).join("\n")
        callbacks.onToken(prompt.includes("章节正文") ? chapterText("被停止的正文", 3000) : "写作任务书内容")
        if (prompt.includes("章节正文")) controller.abort()
        callbacks.onDone()
      }),
    }

    await expect(runDeepChapterGeneration(
      { projectPath: "E:/Novel", userRequest: "生成第3章", chapterNumber: 3, llmConfig },
      {},
      deps,
      controller.signal,
    )).rejects.toThrow("已停止生成")

    expect(deps.reviewChapter).not.toHaveBeenCalled()
  })
})

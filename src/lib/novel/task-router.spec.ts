import { describe, expect, it } from "vitest"
import { routeTask } from "./task-router"

describe("routeTask chapter generation", () => {
  it("routes continue-next-chapter requests into chapter generation flow", () => {
    const route = routeTask("继续生成下一章")

    expect(route.intent).toBe("continue_chapter")
  })

  it("routes the continue-next-chapter button prompt into chapter generation flow", () => {
    const route = routeTask("请根据当前小说上下文、记忆库、最新章节结尾、下一章推进建议和章纲，继续生成下一章正文。")

    expect(route.intent).toBe("continue_chapter")
  })

  it("routes outline-based chapter requests and extracts Chinese chapter numbers", () => {
    const route = routeTask("请根据第八章章纲生成正文")

    expect(route.intent).toBe("write_chapter")
    expect(route.chapterNumber).toBe(8)
  })

  it("routes analyze-outline-then-generate-chapter requests into chapter writing", () => {
    const route = routeTask("分析大纲内容去生成第3章")

    expect(route.intent).toBe("write_chapter")
    expect(route.chapterNumber).toBe(3)
  })
})

import { runSimulation, type SimulationCallbacks } from "../simulation-engine"
import type { ChatMessage } from "@/lib/llm-client"
import { streamChat } from "@/lib/llm-client"
import type { LlmConfig } from "@/stores/wiki-store"
import type {
  ExtractionResult,
  NovelAgent,
  SimulationEvent,
  SimulationInput,
  StoryFramework,
} from "../types"

// 每个分支最多推演的节点数，用于限制深度、控制 token 消耗。
const MAX_BRANCH_NODES = 2
// 为关键角色生成的决策选项数量。
const DECISION_OPTION_COUNT = 3

interface DecisionOption {
  title: string
  description: string
}

// 将 streamChat 的流式回调收拢为一个完整字符串（与 simulation-engine 内部实现一致）。
async function collectStream(
  config: LlmConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  let result = ""
  let streamError: Error | null = null

  await streamChat(
    config,
    messages,
    {
      onToken: (token) => {
        result += token
      },
      onDone: () => {},
      onError: (err) => {
        streamError = err
      },
    },
    signal,
  )

  if (streamError) throw streamError
  return result
}

// 从 LLM 文本中解析 JSON 数组形式的决策选项，失败返回 null。
function parseDecisionOptions(raw: string): DecisionOption[] | null {
  const trimmed = raw.trim()

  const tryParse = (text: string): DecisionOption[] | null => {
    try {
      const parsed = JSON.parse(text) as unknown
      if (!Array.isArray(parsed)) return null
      const options: DecisionOption[] = []
      for (const item of parsed) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>
          const title = obj.title !== undefined ? String(obj.title) : ""
          const description =
            obj.description !== undefined ? String(obj.description) : ""
          if (title || description) options.push({ title, description })
        } else if (typeof item === "string" && item.trim()) {
          options.push({ title: item.trim(), description: item.trim() })
        }
      }
      return options.length > 0 ? options : null
    } catch {
      return null
    }
  }

  // 直接解析
  const direct = tryParse(trimmed)
  if (direct) return direct

  // 从 markdown 代码块中提取
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  if (codeBlockMatch) {
    const fromBlock = tryParse(codeBlockMatch[1].trim())
    if (fromBlock) return fromBlock
  }

  // 从文本中查找第一个 JSON 数组
  const arrayMatch = /\[[\s\S]*\]/.exec(trimmed)
  if (arrayMatch) {
    const fromArray = tryParse(arrayMatch[0])
    if (fromArray) return fromArray
  }

  return null
}

// 选取关键角色：优先取第一个节点涉及的 agent，否则取第一个 agent。
function pickKeyAgent(input: SimulationInput): NovelAgent | undefined {
  const firstNode = input.framework.nodes[0]
  if (firstNode) {
    const involved = input.agents.find((a) =>
      firstNode.involvedCharacters.includes(a.name),
    )
    if (involved) return involved
  }
  return input.agents[0]
}

// 构建生成决策选项的 LLM 消息。
function buildDecisionMessages(
  input: SimulationInput,
  extraction: ExtractionResult,
): ChatMessage[] {
  const agent = pickKeyAgent(input)
  const framework = input.framework
  const firstNode = framework.nodes[0]

  const system = [
    "你是一位小说剧情推演助手。",
    "你的任务是为关键角色生成几个不同方向的决策选项，用于分支推演。",
    "只输出一个 JSON 数组，数组中每个元素是一个对象：",
    '  { "title": "决策标题（简短）", "description": "决策的具体内容与动机" }',
    `请生成 ${DECISION_OPTION_COUNT} 个选项，每个选项代表一种截然不同的行动方向。`,
    "不要输出任何其他文字。",
  ].join("\n")

  const user = [
    `故事前提：${framework.premise}`,
    firstNode ? `当前节点：${firstNode.title}（核心冲突：${firstNode.coreConflict}）` : "",
    `关键角色：${agent?.name ?? "主角"}`,
    agent ? `角色设定：${agent.profile}` : "",
    `世界规则：${extraction.worldRules || "（无）"}`,
    "",
    `请为「${agent?.name ?? "主角"}」生成 ${DECISION_OPTION_COUNT} 个决策选项。`,
  ]
    .filter((line) => line !== undefined && line !== "")
    .join("\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

// 限制框架节点数，控制每个分支的推演深度。
function trimFramework(
  framework: StoryFramework,
  maxNodes: number,
): StoryFramework {
  if (framework.nodes.length <= maxNodes) return framework
  return {
    ...framework,
    nodes: framework.nodes.slice(0, maxNodes),
  }
}

export async function runDecisionTreeSimulation(
  input: SimulationInput,
  extraction: ExtractionResult,
  callbacks: SimulationCallbacks,
  signal?: AbortSignal,
): Promise<SimulationEvent[]> {
  const allEvents: SimulationEvent[] = []

  // 1. 为关键角色生成决策选项
  let options: DecisionOption[] | null = null
  try {
    const messages = buildDecisionMessages(input, extraction)
    const raw = await collectStream(input.llmConfig, messages, signal)
    if (signal?.aborted) return allEvents
    options = parseDecisionOptions(raw)
  } catch {
    options = null
  }

  // 无法生成决策选项时，回退到普通 runSimulation
  if (!options || options.length === 0) {
    callbacks.onProgress(0, "无法生成决策选项，回退到普通推演")
    return runSimulation(
      { ...input, mode: "decision-tree" },
      extraction,
      callbacks,
      signal,
    )
  }

  const trimmedFramework = trimFramework(input.framework, MAX_BRANCH_NODES)
  const branchCount = options.length

  // 2. 对每个决策选项推演一条分支
  for (let i = 0; i < branchCount; i++) {
    if (signal?.aborted) break

    const option = options[i]
    const injectionEvent = `【决策分支 ${i + 1}】${option.title}：${option.description}`

    callbacks.onProgress(
      Math.round((i / branchCount) * 100),
      `推演决策分支 ${i + 1}/${branchCount}：${option.title}`,
    )

    // 子分支内部事件不转发给外部回调，避免输出过多
    const branchCallbacks: SimulationCallbacks = {
      onEvent: () => {},
      onProgress: () => {},
      onComplete: () => {},
      onError: () => {},
    }

    try {
      const branchInput: SimulationInput = {
        ...input,
        mode: "decision-tree",
        framework: trimmedFramework,
        injectionEvent,
      }
      const branchEvents = await runSimulation(
        branchInput,
        extraction,
        branchCallbacks,
        signal,
      )
      allEvents.push(...branchEvents)
    } catch {
      // 单个分支失败不影响其他分支的推演
    }
  }

  if (!signal?.aborted) {
    callbacks.onProgress(100, "决策树推演完成")
    callbacks.onComplete(allEvents)
  }

  return allEvents
}

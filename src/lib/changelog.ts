export interface ChangelogEntry {
  version: string
  date: string
  highlights: {
    en: string[]
    zh: string[]
  }
}

const TWO_POINT_ZERO_CHANGELOG: ChangelogEntry = {
  version: "2.0.0",
  date: "2026-06-04",
  highlights: {
    en: [
      "Major release: upgraded QMAI from a basic AI writing assistant into a staged novel-writing workflow with planning, generation, review, rewrite, and traceable revision loops.",
      "AI Chat now supports deep chapter generation with context analysis, task brief, draft writing, AI review, revision, final lightweight review, and de-AI polish.",
      "AI Outline now uses staged thinking generation with live progress, outline task briefs, draft generation, self-checking, cleaner saving, and quick generation tools for chapter outlines, characters, factions, abilities, foreshadowing, and locations.",
      "Review Center was rebuilt around staged deep review and six independent professional review workflows: thrill density, setting autonomy, pacing tension, character consistency, narrative continuity, and reader pull.",
      "AI Rewrite now provides multi-change previews, editable generated content, regenerate support, confirm-to-replace behavior, View Change highlighting, Ignore, and Restore Original.",
      "Thinking and model compatibility were improved across OpenAI-compatible endpoints, Responses API, Qwen3 thinking models, custom model diagnostics, Chinese endpoint hints, and model list handling.",
      "Memory and chapter workflows were strengthened with re-extract memory actions, persistent progress after page switching, Memory Center edit/delete controls, and clearer memory-risk warnings.",
      "Interface improvements include AI Chat / AI Outline bottom-right docking, fixed double-scrollbar issues, responsive chapter toolbar actions, clearer thinking panels, and localized review/model-setting text.",
      "Feedback submission now includes a fallback path for networks where the desktop HTTP client fails.",
    ],
    zh: [
      "本次 2.0.0 是一次大型版本升级，青幕AI写作从普通 AI 辅助写作工具升级为更完整的小说创作工作流系统，覆盖规划、生成、审查、修改和可追踪返修。",
      "AI 会话新增深度章节生成流程：会依次进行上下文分析、写作任务书、正文初稿、AI审稿、问题返修、最终简单审查和去AI味润色，让章节生成更接近专业写作流程。",
      "深度章节生成增加约 3000 字正文目标、短正文自动扩写补足、重复输出检测、异常超长保护和停止生成逻辑，避免内容过短、复读循环或无法中断。",
      "AI 大纲升级为阶段式思考生成，支持实时显示上下文分析、大纲任务书、大纲草稿和大纲自检；同时优化保存逻辑，并新增章节细纲、人物小传、组织势力、能力体系、伏笔计划和地点设定快捷生成入口。",
      "审查中心升级为阶段式深度审稿，会结合章节正文、大纲节点、上下文、记忆库、伏笔、人物状态、时间线和角色认知状态进行综合分析。",
      "六维审查重构为六个独立专业工作流：爽感密度、设定自治、节奏张力、人设一致、叙事衔接和追读引力。每个维度都会独立进行高强度 thinking 分析，并输出评分、总结、证据和修改目标。",
      "AI修改流程全面优化：支持多条“原文 / 新内容”对比预览、生成内容可编辑、重新生成、确认后覆盖原文、查看修改高亮、忽略和恢复原文。",
      "Thinking 思考模式和模型兼容性进一步增强，OpenAI兼容、Responses API、Qwen3 等模型会按设置发送思考参数，并补充模型测试、模型列表、接口地址和中转站兼容提示。",
      "记忆与章节管理优化：重新提取记忆、查看记忆、维护扫描等状态在切换页面后仍会保持；记忆中心新增编辑和删除入口，并在删除时提示可能影响后续正文生成。",
      "界面体验优化：AI 会话和 AI 大纲支持底栏/右侧停靠，修复多处双滚动条问题，章节工具栏支持窄窗口自动收进“更多”，思考区显示更稳定，审查与模型设置中的英文提示也进一步中文化。",
      "反馈提交逻辑增加备用发送方式，改善部分网络环境下无法提交反馈的问题。",
    ],
  },
}

function isMergedOnePointRelease(version: string): boolean {
  const match = /^1\.0\.(\d+)$/.exec(version)
  if (!match) return false
  const patch = Number(match[1])
  return patch >= 8 && patch <= 32
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.32",
    date: "2026-06-03",
    highlights: {
      en: [
        "Changed Six-Dimension Review into six independent professional workflows instead of filtering one shared AI review result.",
        "Each dimension now runs staged high-reasoning analysis and strict JSON output with its own score, summary, thinking, evidence, and rewrite targets.",
        "AI Review remains available as the original general review flow, while six-dimension issues continue to support AI Rewrite, Ignore, View Change, and Restore Original.",
      ],
      zh: [
        "将六维审查改为六个独立专业工作流，不再只是从同一份 AI 审稿结果中分类筛选。",
        "每个维度都会独立进行高强度阶段式 thinking 分析，并输出独立评分、总结、思考过程、证据和修改目标。",
        "保留原有 AI审稿 总审稿入口，六维问题仍继续支持 AI修改、忽略、查看修改和恢复原文等操作。",
      ],
    },
  },
  {
    version: "1.0.31",
    date: "2026-06-03",
    highlights: {
      en: [
        "Upgraded AI Review into a staged deep-review workflow with context loading, outline alignment, memory/fact checks, dimension review, blocking judgment, and final verification.",
        "AI Review now requests high reasoning for every review stage and streams staged thinking progress into Review Center while keeping the final result format compatible with existing review actions.",
        "Deep review now includes outline nodes, chapter context, memory, foreshadowing, character state, timeline, and character cognition checks before producing the final JSON issue list.",
      ],
      zh: [
        "将审查中心 AI审稿升级为阶段式深度审稿流程：依次进行任务识别、上下文检索、章节目标对齐、事实与记忆核对、逐维度审查、阻断判定和二次复核。",
        "AI审稿每个阶段都会按高级 thinking 请求模型，并在审查中心显示阶段进度；最终结果仍保持原有结构，AI修改、忽略、历史记录等功能继续复用。",
        "深度审稿会结合大纲节点、章节上下文、记忆库、伏笔、人物状态、时间线和角色认知状态后再输出最终问题列表。",
      ],
    },
  },
  {
    version: "1.0.30",
    date: "2026-06-03",
    highlights: {
      en: [
        "Added runaway-output protection for deep chapter generation: repeated loops and abnormally long chapter output now stop automatically before they can grow into huge drafts.",
        "Fixed AI Chat stop handling during deep chapter generation so user cancellation stops the staged workflow instead of continuing into review or revision.",
        "Added one final simple review and de-AI polish pass after draft review/revision to reduce mechanical phrasing while preserving plot and continuity.",
      ],
      zh: [
        "修复 AI 会话深度章节生成陷入复读循环的问题：检测到重复段落或异常超长输出时会自动停止重复内容，避免生成十几万字的异常章节。",
        "修复深度章节生成无法停止的问题：用户点击停止后，会立即中断后续审稿、返修和收尾流程，并显示“已停止生成”。",
        "新增最终简单审查与去AI味收尾：二次审查/返修后会再做一遍轻量检查，减少机械套话、重复句式和 AI 味，同时保留剧情与设定。",
      ],
    },
  },
  {
    version: "1.0.29",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed deep chapter generation producing very short drafts by enforcing an approximately 3000-character chapter target.",
        "Added an automatic expansion pass when the first chapter draft or revised draft is too short, then runs review on the expanded full chapter.",
        "Raised the deep chapter generation output token budget so OpenAI-compatible relay services are less likely to cut chapters off early.",
      ],
      zh: [
        "修复 AI 会话深度章节生成正文过短的问题：章节正文现在强制按约 3000 字生成，建议范围为 2800-3300 字，低于 2600 字视为未完成。",
        "新增短正文自动扩写补足：如果初稿或返修稿明显过短，会自动进入扩写补足阶段，再对完整章节进行 AI 审稿。",
        "提高深度章节生成的输出 token 上限，降低第三方 OpenAI 兼容中转站默认上限导致章节提前截断的概率。",
      ],
    },
  },
  {
    version: "1.0.28",
    date: "2026-06-03",
    highlights: {
      en: [
        "Changed deep chapter generation so the Deep Chapter button is the only switch: when enabled, all AI Chat requests in novel mode use the staged chapter workflow.",
        "Made AI Chat and AI Outline deep thinking panels fixed-height and scrollable for long staged output.",
        "Updated AI Outline staged generation to refresh each stage while streaming, so task brief, draft, and self-check progress no longer appear stuck after one result.",
      ],
      zh: [
        "调整深度章节生成逻辑：是否进入深度章节流程只看“深度章节生成”按钮，开启后小说模式下 AI 会话的所有输入都会走阶段式章节生成。",
        "AI 会话与 AI 大纲的深度思考区改为固定高度滚动显示，内容很长时不会撑乱会话窗口。",
        "AI 大纲阶段生成改为阶段内流式刷新，大纲任务书、大纲草稿和大纲自检会持续更新，避免只显示一个结果后像卡住。",
      ],
    },
  },
  {
    version: "1.0.27",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed AI Chat staged chapter generation routing so continue-next-chapter and outline-based chapter requests enter the deep generation workflow instead of returning directly.",
        "Changed AI Outline generation and regeneration to a staged Codex-style flow with context analysis, outline task brief, draft generation, self-check, and visible thinking stages.",
      ],
      zh: [
        "修复 AI 会话阶段深度生成路由：继续生成下一章、根据章纲生成正文等请求会进入上下文分析、任务书、初稿、审稿、返修流程，不再直接普通出结果。",
        "AI 大纲生成与重新生成改为阶段式流程思考：依次显示大纲上下文分析、大纲任务书、大纲草稿、大纲自检和完成阶段。",
      ],
    },
  },
  {
    version: "1.0.26",
    date: "2026-06-03",
    highlights: {
      en: [
        "Expanded the AI Chat thinking panel so streaming and completed thinking content is fully visible without an inner scrollbar.",
        "Improved the deep chapter generation toggle with a stronger selected state so users can clearly see when staged thinking generation is enabled.",
      ],
      zh: [
        "优化 AI 会话 thinking / 思考区显示：流式和完成后的思考内容都会完整展开，不再使用内部滚动或折叠预览。",
        "增强深度章节生成按钮的选中态：开启后使用更深的高对比颜色，方便用户确认当前已启用阶段思考生成。",
      ],
    },
  },
  {
    version: "1.0.25",
    date: "2026-06-03",
    highlights: {
      en: [
        "Added deep chapter generation for novel chat: chapter writing requests now run through context analysis, task brief, draft, AI review, and one automatic revision pass when blocking issues are found.",
        "Deep generation stage results are displayed in the thinking panel, while the final assistant answer remains clean chapter prose for saving.",
      ],
      zh: [
        "AI 会话新增深度章节生成：生成章节时会依次进行上下文分析、写作任务书、正文初稿、AI 审稿，并在发现严重问题时自动返修一次。",
        "深度生成的阶段结果会显示在 thinking / 思考区，最终回复仍保持为干净的章节正文，方便直接保存到章节库。",
      ],
    },
  },
  {
    version: "1.0.24",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed the remaining right-docked writing double scrollbar by preventing the immersive writing textarea from creating its own scrollbar after width changes.",
        "Adjusted the chapter toolbar compact threshold so normal-width windows show direct actions, while narrow windows still collapse actions into More and keep the chapter title/status visible.",
      ],
      zh: [
        "修复右侧 AI 会话停靠后正文区仍可能出现双滚动条的问题：窗口宽度变化时会重新计算正文输入区高度，并禁止正文输入区生成自己的滚动条。",
        "调整章节工具栏响应式收起规则：正常窗口宽度下直接显示操作按钮，窄窗口下才收进“更多”，同时保留章节标题、状态和字数信息。",
      ],
    },
  },
  {
    version: "1.0.23",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed AI Chat thinking mode so visible chat generation now sends an explicit high reasoning request when the model setting is Auto.",
        "Added Responses API reasoning stream parsing so reasoning text deltas can appear in the AI Chat thinking panel.",
      ],
      zh: [
        "修复 AI会话思考模式：模型设置为“自动”时，AI会话这类用户可见生成会默认按高强度 thinking 请求模型。",
        "补充 Responses API 思考流解析，reasoning 事件现在可以进入 AI会话的思考过程显示区域。",
      ],
    },
  },
  {
    version: "1.0.22",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed the remaining double-scrollbar issue in chapter writing by making the preview content shell non-scrollable for immersive chapters.",
        "Fixed chapter toolbar compact mode so width observation starts after the selected chapter has loaded, keeping chapter title/status visible and moving actions into More in narrow windows.",
      ],
      zh: [
        "继续修复章节正文双滚动条：章节沉浸写作时，预览内容外壳不再参与滚动，只保留正文内部滚动条。",
        "修复章节工具栏响应式未生效：章节加载后重新绑定宽度监听，窄窗口下保留章节标题和状态，操作稳定收进“更多”。",
      ],
    },
  },
  {
    version: "1.0.21",
    date: "2026-06-03",
    highlights: {
      en: [
        "Moved the AI chat dock controls into the AI Chat and AI Outline input areas as two direct icon buttons.",
        "Fixed AI Outline saving so generated frontmatter is removed, duplicate outline titles are avoided, and the saved status only shows the final title.",
        "Fixed right-docked writing layout double scrollbars and kept chapter title/status visible when chapter actions collapse into the More menu.",
      ],
      zh: [
        "将 AI 会话停靠切换移入 AI会话和 AI大纲输入框左侧，改为直接显示底栏/右侧两个图标。",
        "修复 AI大纲保存：自动清理模型返回的 frontmatter，避免与已有大纲标题重复，保存状态只显示最终标题。",
        "修复右侧四栏写作区双滚动条，并优化章节工具栏响应式显示，窗口变窄时保留章节标题和状态，操作收进“更多”。",
      ],
    },
  },
  {
    version: "1.0.20",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed the right-docked AI chat area so normal window sizes no longer create nested scrollbars.",
        "Moved the AI dock-position control to the top-right edge of the app content so it no longer overlaps chat tabs.",
        "Made the chapter toolbar responsive: narrow layouts move chapter actions into a More menu, while wide layouts show all actions.",
      ],
      zh: [
        "修复右侧 AI 会话停靠在正常窗口下可能出现双滚动条的问题。",
        "调整 AI 会话停靠设置按钮位置，移动到应用内容区右上角，避免压住会话标签。",
        "优化章节工具栏响应式显示：窗口变窄时功能自动收进“更多”菜单，宽度充足时恢复全部显示。",
      ],
    },
  },
  {
    version: "1.0.19",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed custom model reasoning settings so OpenAI-compatible, Responses API, and Qwen3 thinking requests now receive the selected thinking mode.",
        "Added a top-right dock setting that moves AI Chat and AI Outline between the bottom panel and the right-side panel.",
        "Added thinking display support to AI Outline while keeping thinking content out of saved/copied outline text.",
      ],
      zh: [
        "修复自定义模型 Reasoning / thinking 设置不生效的问题：OpenAI 兼容、Responses API 和 Qwen3 思考模型会按所选模式发送思考参数。",
        "新增右上角 AI 会话停靠设置，可在底栏和右侧之间切换 AI 会话与 AI 大纲显示位置。",
        "AI 大纲新增思考过程显示，并避免将思考内容写入保存或复制的大纲正文。",
      ],
    },
  },
  {
    version: "1.0.18",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed AI Rewrite application so edited or regenerated preview content replaces the original passage instead of being inserted beside it.",
        "Added a View Change action for AI rewrites to open the chapter and highlight the modified text.",
      ],
      zh: [
        "修复 AI修改在用户编辑生成内容或重新生成后确认时可能插入到原文旁边的问题，现在只会按预览左侧原文完整覆盖写回。",
        "为所有 AI修改结果增加“查看修改”按钮，点击后自动进入正文并高亮修改后的内容。",
      ],
    },
  },
  {
    version: "1.0.17",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed six-dimension review result cards so they use localized labels and show AI Rewrite, Restore, and Ignore actions.",
      ],
      zh: [
        "修复六维审查结果卡片：严重程度和问题类型改为中文显示，并恢复 AI修改、恢复原文、忽略操作按钮。",
      ],
    },
  },
  {
    version: "1.0.16",
    date: "2026-06-03",
    highlights: {
      en: [
        "Made the dashboard AI Rewrite preview content editable before confirming replacement.",
      ],
      zh: [
        "优化审查看板 AI修改预览：AI生成的补写/改写内容现在可以在弹窗中直接编辑，确认后按用户修改后的内容写回章节。",
      ],
    },
  },
  {
    version: "1.0.15",
    date: "2026-06-03",
    highlights: {
      en: [
        "Fixed the dashboard AI Rewrite preview parser so fact-check rewrite plans returned with anchor_text and insert_text fields can be applied normally.",
      ],
      zh: [
        "修复审查看板中 AI修改预览解析错误：模型按提示返回 anchor_text / insert_text 时，现在可以正确识别补写位置和补写内容。",
      ],
    },
  },
  {
    version: "1.0.14",
    date: "2026-06-03",
    highlights: {
      en: [
        "Reworked AI review rewrites into a multi-change preview that compares original and revised text before applying changes.",
        "Removed the separate Edit action from review issue cards because AI Rewrite now handles locating and editing content.",
        "Localized internal review labels such as fact-check issue types and foreshadowing debt severity.",
        "Added a Continue Next Chapter action in the chapter chat result toolbar.",
        "Added outline refinement quick actions in the AI outline chat for chapter outlines, character briefs, factions, power system, foreshadowing, and locations.",
      ],
      zh: [
        "重做审查结果的 AI修改流程：生成多条“原文 / 新内容”对比，用户确认后才写回原章节。",
        "移除审查问题卡片中的单独“编辑”按钮，由 AI修改负责定位、生成、编辑和忽略修改项。",
        "修复审查中心里的内部英文显示，将事实检查类型、伏笔债务严重度等改为中文。",
        "在正文生成结果工具栏新增“继续生成下一章”按钮，自动沿用小说上下文和记忆库逻辑生成后续章节。",
        "在 AI大纲对话底部新增章节细纲、人物小传、组织势力、金手指与能力体系、伏笔计划、地点设定快捷生成入口。",
      ],
    },
  },
  {
    version: "1.0.13",
    date: "2026-06-03",
    highlights: {
      en: [
        "Restored the Edit, AI Rewrite, and Ignore actions under AI review results in Review Center.",
        "AI review rewrites now reuse the existing preview, replace, restore-original, and ignored-result persistence flow.",
      ],
      zh: [
        "恢复审查中心 AI审稿结果下方的“编辑 / AI修改 / 忽略”操作按钮。",
        "AI审稿结果的 AI修改重新接入预览确认、替换原文、恢复原文和忽略结果持久化流程。",
      ],
    },
  },
  {
    version: "1.0.12",
    date: "2026-06-03",
    highlights: {
      en: [
        "Moved the AI review entry above six-dimension review in Review Center.",
        "Removed per-dimension review buttons from the left sidebar and added a unified Start Review action in the upper-right content header.",
      ],
      zh: [
        "将审查中心左侧的“AI审稿”入口移动到“六维审查”上方。",
        "移除左侧六维审查中每一项的单独“审查”按钮，在内容区右上角新增统一的“开始审稿”入口。",
      ],
    },
  },
  {
    version: "1.0.11",
    date: "2026-06-03",
    highlights: {
      en: [
        "Localized custom model endpoint warnings to Chinese, including missing version-path hints such as /v1.",
      ],
      zh: [
        "将自定义模型接口地址提示改为中文，包括缺少 /v1 等版本路径时的提醒文案。",
      ],
    },
  },
  {
    version: "1.0.10",
    date: "2026-06-02",
    highlights: {
      en: [
        "Improved custom model list display so manually typed models are clearly marked when they are not returned by the API.",
        "Improved unsupported-model test errors with a clearer instruction to pick a fetched model or verify the relay's exact model ID.",
      ],
      zh: [
        "优化自定义模型列表显示：手动填写但不在接口返回列表中的模型，会明确标记为“当前填写（不在已拉取模型中）”。",
        "优化模型测试中的“不支持所选模型”提示，引导用户从已拉取模型中选择，或向中转站确认正确模型 ID。",
      ],
    },
  },
  {
    version: "1.0.9",
    date: "2026-06-02",
    highlights: {
      en: [
        "Improved custom model test diagnostics when a relay server rejects desktop, browser, or common SDK clients.",
      ],
      zh: [
        "优化自定义模型测试提示：当中转站限制桌面端、浏览器或常见 SDK 客户端来源时，会明确提示需要联系中转站开通通用 OpenAI 兼容 API，或更换可直连的中转站。",
      ],
    },
  },
  {
    version: "1.0.8",
    date: "2026-06-02",
    highlights: {
      en: [
        "Fixed chapter memory re-extraction and maintenance duplicate-scan progress so the in-progress state remains visible after switching away and back.",
        "Renamed snapshot actions to memory-focused labels, including Re-extract Memory and View Memory.",
        "Added Responses API support for custom LLM endpoints with usage guidance and model-list URL handling.",
        "Improved feedback submission with a browser-fetch fallback when the Tauri HTTP client fails on some networks.",
        "Added Memory Center editing and deletion controls, including a red deletion warning because removed memory can affect later AI chapter generation.",
      ],
      zh: [
        "修复正文重新提取记忆、维护工具扫描重复项在切换页面后丢失进行中状态的问题。",
        "将“重新生成快照”“查看快照”等操作文案调整为“重新提取记忆”“查看记忆”。",
        "自定义模型新增 Responses API 模式，并补充使用说明、接口地址处理和模型列表拉取兼容。",
        "优化反馈提交逻辑，当部分网络下 Tauri HTTP 请求失败时，会自动尝试备用发送方式。",
        "记忆中心新增编辑与删除入口，删除时会显示红色风险提示，提醒删除记忆可能影响后续 AI 正文生成。",
      ],
    },
  },
  {
    version: "1.0.7",
    date: "2026-06-02",
    highlights: {
      en: [
        "Fixed theme color display issues, including white contrast in the blue theme and red accents in the dark theme.",
        "Saving a final chapter and extracting raw outline memory now generate snapshots and sync them to novel memory automatically, removing the old manual sync step.",
        "Added a feedback entry in Settings so users can submit issues and suggestions for backend review.",
        "Added a software usage guide in Settings with links to the complete guide, official user manual, and novel-writing introduction.",
        "Added a dismissible lower-left usage-guide prompt that opens the software usage guide directly.",
      ],
      zh: [
        "修复颜色设置中部分主题显示异常的问题，优化蓝色主题下白色文字/背景显示，并调整黑色主题中的红色效果。",
        "章节保存为正式章节后会自动生成快照并同步到小说记忆；大纲库提取原始记忆后也会自动生成快照并同步记忆。",
        "移除原本需要手动点击的“同步记忆”步骤，减少章节和大纲记忆整理时的重复操作。",
        "在设置中新增“反馈”入口，用户可以直接提交使用问题、建议或异常反馈，反馈内容会进入后台方便查看和处理。",
        "在设置中新增“软件使用说明”入口，内置完整使用说明、正式用户手册、小说功能介绍三个文档链接。",
        "在软件左下角新增“软件不知道怎么使用？点我”提示，点击后会直接进入设置中的“软件使用说明”页面，用户也可以手动关闭该提示窗。",
      ],
    },
  },
  {
    version: "1.0.5",
    date: "2026-06-01",
    highlights: {
      en: [
        "Added folder deletion to the outline tree context menu. Descendant outline markdown files are moved to trash before the folder itself is removed.",
        "When other non-outline files still remain in that folder, the app now keeps the folder and shows a warning instead of deleting it blindly.",
      ],
      zh: [
        "大纲列表右键菜单新增“删除文件夹”，会先把目录下所有大纲 Markdown 文档移入回收站，再删除空文件夹。",
        "如果文件夹里仍有未处理的其他文件，系统会保留文件夹本身并给出中文提示，避免误删。",
      ],
    },
  },
  {
    version: "1.0.4",
    date: "2026-06-01",
    highlights: {
      en: [
        "Fixed the streaming scroll lock in AI chat and AI outline sessions so you can scroll up to review earlier content while generation continues.",
        "Fixed file edit preview state so all detected outline edits can be displayed and applied instead of only the first result.",
      ],
      zh: [
        "修复 AI 会话和 AI 大纲会话在持续生成时滚动条被强制锁到底部的问题，现在可以自由向上查看历史内容。",
        "修复大纲批量修改预览状态不完整的问题，确保识别出的修改项能够完整显示并逐条应用。",
      ],
    },
  },
  {
    version: "1.0.3",
    date: "2026-06-01",
    highlights: {
      en: [
        "Added outline document import and folder import in the outline sidebar.",
        "Imported files now enter the outline library first, and initial memory extraction remains a manual user action.",
      ],
      zh: [
        "大纲侧边栏新增“导入文档”和“导入文件夹”功能，可以直接把外部资料整理进大纲库。",
        "导入后的内容默认只进入大纲库，不会自动提取记忆，仍由用户手动执行提取。",
      ],
    },
  },
  {
    version: "1.0.2",
    date: "2026-06-01",
    highlights: {
      en: [
        "Outline initial-memory extraction now keeps running in the background even if you switch away and come back later.",
        "Added one-click extract for the entire outline library, processing outline files one by one and saving a snapshot for each document.",
      ],
      zh: [
        "修复大纲库“提取初始记忆”切到其他页面后会中断的问题，返回后仍能保持正确的提取状态。",
        "大纲库新增“一键提取”，会按文档逐个提取初始记忆，并为每个大纲生成对应快照。",
      ],
    },
  },
  {
    version: "1.0.1",
    date: "2026-06-01",
    highlights: {
      en: [
        "Restored the memory center recent snapshot list to show the latest 10 items instead of stopping at 6.",
        "Cleaned up soul binding candidates so character binding only shows valid character entries and hides unrelated outline sections.",
      ],
      zh: [
        "修复记忆中心“最近章节快照”只显示 6 条的问题，现在会完整显示最近 10 条。",
        "修复角色灵魂绑定人物列表混入无关信息的问题，现在只显示可绑定的角色人物。",
      ],
    },
  },
  {
    version: "1.0.0",
    date: "2026-06-01",
    highlights: {
      en: [
        "Fixed the bug where AI generation could still pull stale memory after outline, graph, or snapshot updates.",
        "Snapshot sync now records revision metadata, archives superseded memory, and keeps current memory projections separate from history.",
        "Rollback now rebuilds the active entity, structured memory, cognition, character-state, and foreshadowing layers so restored memory becomes the default source again.",
      ],
      zh: [
        "修复大纲、图谱或快照更新后，AI 生成内容仍可能读取旧记忆数据的问题。",
        "同步记忆时新增快照版本元数据，并将历史归档与当前有效记忆投影分开管理。",
        "回滚历史快照时会同步重建当前实体页、结构化记忆、角色认知、人物状态与伏笔追踪，使恢复后的记忆重新成为默认读取来源。",
      ],
    },
  },
  {
    version: "0.4.20",
    date: "2026-06-01",
    highlights: {
      en: [
        "AI chat removed the old 'save as final chapter' and 'discard draft' buttons, while keeping 'save to chapter library' as the draft-saving path.",
        "AI outline generation added copy and regenerate actions, and now shows the referenced source materials more clearly.",
      ],
      zh: [
        "AI 会话删除“保存为正式章节”和“废弃草稿”按钮，保留“保存到章节库”作为草稿保存入口。",
        "AI 大纲生成新增复制、重新生成按钮，并补充引用资料展示。",
      ],
    },
  },
  {
    version: "0.4.19",
    date: "2026-05-31",
    highlights: {
      en: [
        "During AI generation you can scroll upward to inspect already generated content instead of being forced to stay at the bottom.",
        "Saving to the chapter library now creates a draft chapter and no longer triggers review or memory extraction immediately.",
        "The outline area added an AI outline button so you can chat against outlines and chapter content, then save the result as a new outline file.",
      ],
      zh: [
        "AI 生成时允许向上滚动查看已生成内容，不再强制锁定到底部。",
        "保存到章节库改为创建草稿章节，不再立即触发审查和记忆提取。",
        "大纲区新增 AI 大纲按钮，可基于大纲与章节内容对话，并将结果保存为新的大纲文档。",
      ],
    },
  },
  {
    version: "0.4.16",
    date: "2026-05-31",
    highlights: {
      en: [
        "Fixed character snapshot titles showing malformed chapter numbers like '-312'; they now display the correct outline name.",
        "Fixed the 'open outline' button so it returns you to the correct outline page.",
        "Renamed 'switch project' to 'switch novel', and added updater download progress plus an 'install now' action.",
      ],
      zh: [
        "修复人物小传快照标题显示异常章节号的问题，现在会正确显示对应大纲名称。",
        "修复“打开大纲”按钮点击后无法跳回大纲页面的问题。",
        "“切换项目”改为“切换小说”，并为更新功能补充下载进度和“立即安装”按钮。",
      ],
    },
  },
  {
    version: "0.4.15",
    date: "2026-05-31",
    highlights: {
      en: [
        "The status indicator in the lower-left corner now reflects model connectivity directly.",
        "Removed the web clipper port setting from network settings.",
        "Fixed a model connectivity URL construction bug that could leave the indicator stuck red.",
      ],
      zh: [
        "左下角状态指示器改为直接显示模型连接状态。",
        "移除网络设置中的网页剪藏端口配置。",
        "修复模型连接检测 URL 构建错误导致状态长期显示异常的问题。",
      ],
    },
  },
  {
    version: "0.4.13",
    date: "2026-05-31",
    highlights: {
      en: [
        "The outline module added a snapshot viewer so extracted initial memory can be opened and reviewed directly.",
        "Fixed the 'extract initial memory' button state so it stays accurate after switching away and returning.",
        "Settings changelog added complete version history and a check-for-updates entry point.",
      ],
      zh: [
        "大纲模块新增“查看快照”，提取初始记忆后可以直接打开并查看快照内容。",
        "修复“提取初始记忆”按钮状态无法保持的问题，切换页面后返回仍能显示正确状态。",
        "设置页更新日志新增完整版本历史和“检查更新”入口。",
      ],
    },
  },
  {
    version: "0.4.12",
    date: "2026-05-31",
    highlights: {
      en: [
        "Fixed the outline initial-memory entry in the memory center so it no longer shows a broken chapter label.",
        "Fixed character biography extraction so the corresponding memory-center card is no longer overwritten by a generic outline title.",
      ],
      zh: [
        "修复大纲提取初始记忆后在记忆中心显示异常章节标签的问题，现在会正确显示大纲名称。",
        "修复人物小传提取初始记忆后在记忆中心展示不正确的问题，不再被通用大纲标题覆盖。",
      ],
    },
  },
  {
    version: "0.4.11",
    date: "2026-05-31",
    highlights: {
      en: [
        "Added user statistics based on a Cloudflare Workers plus D1 deployment.",
      ],
      zh: [
        "新增用户统计能力，采用 Cloudflare Workers + D1 方案。",
      ],
    },
  },
  {
    version: "0.4.10",
    date: "2026-05-20",
    highlights: {
      en: [
        "Refocused the app as a novel-writing assistant around chapters, outlines, character state, foreshadowing, timelines, and graph views.",
        "Strengthened long-form writing support such as context continuity, chapter memory, and review checks to reduce forgotten details and setting conflicts.",
      ],
      zh: [
        "将产品定位更新为小说写作助手，围绕章节、大纲、人物状态、伏笔、时间线和图谱能力展开。",
        "强化写作上下文、章节记忆与审稿检查等长篇创作能力，减少遗忘和设定冲突。",
      ],
    },
  },
]

export function currentVersionChangelog(version: string): ChangelogEntry[] {
  if (version === TWO_POINT_ZERO_CHANGELOG.version) return [TWO_POINT_ZERO_CHANGELOG]
  if (isMergedOnePointRelease(version)) return []
  return CHANGELOG.filter((entry) => entry.version === version)
}

export function allChangelog(): ChangelogEntry[] {
  return [
    TWO_POINT_ZERO_CHANGELOG,
    ...CHANGELOG.filter((entry) => !isMergedOnePointRelease(entry.version)),
  ]
}

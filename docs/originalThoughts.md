Agent Inbox：从 ChatGPT 到 Coding Agent 的需求中转层

0. 一句话定义

Agent Inbox 是一个位于 ChatGPT、LLM Wiki、本地仓库、Codex/Kiro/Claude Code 之间的“需求中转层”。

它的目标不是管理文件，而是管理“讨论后形成的需求意图”：让 ChatGPT 中完成的推敲、决策、边界、验收标准，可以通过自然语言沉淀到一个待存区，再由本地工具和 Coding Agent 自动读取、加工、归档、执行。

⸻

1. 目标体验

理想交互是：

把我们刚才关于 reel.appliedForce 和线长追赶的讨论，沉淀成一个待实现需求，放到捕鱼物理项目的 AI Inbox。暂时不要进入正式开发。

系统自动完成：

1. ChatGPT 生成标准 handoff 文档；
2. 内容进入云端或工具层的 Inbox；
3. 本地同步器自动拉取；
4. LLM Wiki / Processor 做摘要、标签、双链、状态判断；
5. 本地仓库中出现稳定入口；
6. Codex / Kiro / Claude Code 可以通过固定规则读取；
7. Agent 执行后把结果、问题、变更摘要回填。

最终用户只需要用自然语言说“保存这个需求”“处理最新 handoff”“把它升级成 Kiro spec”。

⸻

2. 核心原则

2.1 ChatGPT 不直接承担本地文件管理

ChatGPT 更适合做：

* 推敲需求；
* 提炼决策；
* 切分边界；
* 形成 handoff；
* 通过自然语言发起投递。

不强求 ChatGPT 直接写入本地仓库路径，因为这会受限于运行环境、权限、客户端形态和本地路径可见性。

2.2 中间必须有 Inbox

不要让 ChatGPT 直接对接每个 Coding Agent。

更好的结构是：

ChatGPT → Agent Inbox → Processor → Agent Adapters → Codex/Kiro/Claude Code

Inbox 是松耦合层。它允许内容先粗糙落地，再逐步整理。

2.3 文件只是输出格式，需求意图才是核心对象

核心对象不是 Markdown 文件，而是：

Handoff {
  id
  title
  project
  system
  status
  source
  summary
  decisions
  constraints
  open_questions
  acceptance_criteria
  related_nodes
  agent_views
  created_at
  updated_at
}

Markdown、Kiro spec、Codex prompt、Claude command 都只是 Handoff 的不同视图。

2.4 不要所有讨论都直接进入开发

需求必须有状态机：

raw → triaged → linked → ready-for-agent → in-progress → implemented → verified → archived
                         ↘ discarded

有些讨论只是概念；有些是决策；有些才是可执行任务。

⸻

3. 总体架构

flowchart LR
    A[ChatGPT 深度讨论] --> B[自然语言保存]
    B --> C[Agent Inbox 云端/工具待存区]
    C --> D[Local Sync Daemon]
    D --> E[Local Handoff Store]
    E --> F[LLM Wiki Processor]
    F --> G[Knowledge Nodes]
    F --> H[Agent Views]
    H --> I[Codex]
    H --> J[Kiro]
    H --> K[Claude Code]
    I --> L[执行结果回填]
    J --> L
    K --> L
    L --> E

⸻

4. 分层设计

Layer 1：Capture / 投递层

负责把 ChatGPT 中的讨论产物投递到 Inbox。

可选入口

1. Google Drive 文件夹；
2. GitHub Issue / Discussion；
3. Notion Database；
4. 自建 HTTP API；
5. 本地快捷键 / 语音 / 剪贴板守护进程；
6. ChatGPT Apps / connector 能力；
7. 浏览器插件或桌面伴侣应用。

MVP 建议\n\n第一版建议从 Git-first Agent Inbox 开始，而不是优先使用 Google Drive / Dropbox / Notion。\n\ntxt\nChatGPT / 手动投递 / 后续自然语言投递\n  ↓\nGitHub Markdown 仓库：agent-inbox\n  ↓\nLLM Wiki 读取并加工\n  ↓\nCodex / Kiro / Claude Code clone / pull 后消费\n\n\n原因：\n\n- Markdown 是一等公民；\n- Git 擅长 diff、history、branch、merge、review；\n- Coding Agent 天然熟悉 Git 仓库；\n- Inbox、Wiki、Agent Views 可以统一在同一个版本化文件系统中；\n- 后续可以通过 GitHub Issue、GitHub App、自建 API 或 ChatGPT connector 继续降低投递摩擦。\n\nGoogle Drive / Dropbox / Notion 可作为补充入口，但不作为第一版的主存储。

⸻

Layer 2：Inbox / 待存区

Inbox 只做一件事：可靠承接原始讨论产物。

目录结构示例

AI-Inbox/
  raw/
    2026-04-30_线长追赶与reel-appliedForce.md
  pending/
  accepted/
  archived/

Inbox 中的原始文件格式

---
title: 线长追赶与 reel.appliedForce
project: fishing-physics
system: fight-physics
status: raw
source: chatgpt
created_at: 2026-04-30
intent: handoff
---
# 原始 Handoff
## 一句话目标
...
## 当前结论
...
## 设计边界
...
## 验收标准
...

⸻

Layer 3：Git Sync / 本地同步层\n\n在 Git-first 方案下，本地同步层的核心不是监听网盘，而是围绕 Git 仓库做 clone、pull、commit、push、branch、PR。\n\n它负责把 GitHub 上的 Agent Inbox / LLM Wiki 同步到本地，并让各个 Coding Agent 能从同一个版本化知识库中读取内容。

职责

1. pull 远端 agent-inbox 仓库；\n2. 检测新增或变更的 raw handoff；\n3. 去重并生成稳定 id；\n4. 触发 Processor；\n5. 生成 processed handoff、wiki nodes、agent views；\n6. commit 加工结果；\n7. 可选 push 到远端；\n8. 更新 latest / pending 索引。

本地目录结构

agent-inbox-repo/\n  inbox/\n    raw/\n    pending/\n    accepted/\n    archived/\n  handoffs/\n    2026/\n      04/\n        2026-04-30_reel-applied-force.md\n  wiki/\n    concepts/\n    decisions/\n    systems/\n    open-questions/\n  agent-views/\n    codex/\n      latest.md\n      pending-index.md\n    kiro/\n      specs/\n    claude/\n      latest.md\n  logs/\n    agent-runs/\n  indexes/\n    by-project.md\n    by-system.md\n    by-status.md

⸻

Layer 4：LLM Wiki Processor / 知识加工层

这是系统的“大脑”。它不只是搬运文件，而是把长讨论变成知识节点。

主要处理任务

1. 摘要生成；
2. 标签提取；
3. 概念识别；
4. 双向链接；
5. open questions 抽取；
6. 决策抽取；
7. 验收标准抽取；
8. 可执行性判断；
9. Agent 视图生成；
10. 状态流转建议。

输出节点类型

concept node        概念节点
decision node       决策节点
handoff node        需求交接节点
open-question node  未决问题节点
agent-view node     Agent 消费视图
log node            执行回填日志

⸻

Layer 5：Agent Adapters / Agent 适配层

同一份 Handoff，对不同 Coding Agent 输出不同格式。

Codex Adapter

输出：

ai-handoff/agent-views/codex/latest.md
AGENTS.md 中增加索引规则

Codex 读取重点：

* 当前目标；
* 相关代码入口；
* 不要做什么；
* 最小改动方案；
* 测试/验证要求；
* 修改后回填。

Kiro Adapter

输出：

.kiro/specs/reel-applied-force/
  requirements.md
  design.md
  tasks.md

Kiro 读取重点：

* requirements；
* acceptance criteria；
* design；
* tasks；
* steering 关联。

Claude Code Adapter

输出：

ai-handoff/agent-views/claude/latest.md
.claude/commands/use-handoff.md

Claude Code 读取重点：

* 先复述理解；
* 先定位文件；
* 再计划；
* 低风险才修改；
* 修改后编译/测试；
* 回填问题。

⸻

5. Handoff 标准格式

# AI Handoff: <标题>
## 0. 一句话目标
...
## 1. 当前结论
...
## 2. 设计边界
### 做
...
### 不做
...
## 3. 核心机制
...
## 4. 数据结构 / 命名
...
## 5. 公式 / 伪代码
...
## 6. 代码修改建议
...
## 7. 验收标准
...
## 8. 风险点
...
## 9. 未决问题
...
## 10. 给 Coding Agent 的指令
请先阅读本文档，结合当前仓库代码，完成以下动作：
1. 定位相关代码；
2. 复述你对需求的理解；
3. 给出最小修改方案；
4. 低风险时再进行代码修改；
5. 修改后运行编译/测试；
6. 输出变更摘要和未解决问题。

⸻

6. 状态机设计

stateDiagram-v2
    [*] --> raw
    raw --> triaged: Processor 分类
    triaged --> linked: 建立关联
    linked --> ready_for_agent: 判断可执行
    linked --> open_question: 关键问题未决
    open_question --> linked: 补充信息
    ready_for_agent --> in_progress: Agent 接手
    in_progress --> implemented: 完成修改
    implemented --> verified: 测试/人工确认
    verified --> archived
    raw --> discarded: 明确废弃
    triaged --> discarded
    linked --> discarded

⸻

7. MVP 版本范围

MVP 必须做

1. 有一个 Inbox；
2. ChatGPT 能产出标准 handoff；
3. 本地能自动同步到 repo；
4. repo 中有 latest.md；
5. Processor 能生成 summary + tags；
6. Codex/Kiro/Claude 至少有一个 Agent 可以稳定读取；
7. Agent 执行后能写回 log。

MVP 暂不做

1. 复杂向量数据库；
2. 全自动归档；
3. 多 Agent 辩论；
4. 自动 PR；
5. 完整权限系统；
6. 完美双链；
7. 复杂 Web UI。

⸻

8. 第一阶段实施路线

Phase 1：手动投递 + 自动同步

目标：先让链路跑通。

ChatGPT 输出 handoff
↓
手动保存到 Drive / AI-Inbox
↓
本地 watcher 同步到 repo/ai-handoff/inbox
↓
生成 latest.md
↓
Codex/Kiro 读取

Phase 2：自然语言投递

目标：减少手动保存。

ChatGPT 通过 app / connector / 自建 API / GitHub Issue 自动投递

Phase 3：LLM Wiki 加工

目标：把 handoff 变成知识节点。

摘要、标签、双链、open questions、agent views

Phase 4：Agent 自动消费

目标：Agent 启动时自动发现 pending handoff。

Codex/Kiro/Claude Code 自动读取 latest / pending

Phase 5：闭环回填

目标：Agent 执行结果反向进入知识库。

变更文件、执行摘要、失败原因、测试结果、剩余风险

⸻

9. 需要后续详细设计的模块

1. Capture 层：ChatGPT 如何自然语言投递；
2. Inbox 存储层：Drive、GitHub、Notion、自建 API 哪个优先；
3. Local Sync Daemon：监听、去重、写入 repo；
4. Handoff Schema：字段、状态、frontmatter；
5. Processor：摘要、标签、双链、状态判断；
6. Agent Adapter：Codex/Kiro/Claude Code 的不同输出；
7. LLM Wiki：知识节点和渐进式读取；
8. 回填机制：Agent 执行后的日志与状态更新；
9. 安全与权限：哪些内容能进 repo，哪些只留在私有知识库；
10. 用户交互：自然语言命令、快捷操作、状态反馈。

⸻

10. 当前推荐方案

第一版建议采用：\n\ntxt\nChatGPT\n  ↓\n生成标准 handoff markdown\n  ↓\n投递到 GitHub 仓库 agent-inbox/inbox/raw\n  ↓\nProcessor 将 raw handoff 加工为 handoffs/wiki/agent-views\n  ↓\nCodex / Kiro / Claude Code 通过 git clone / pull 读取\n  ↓\nAgent 执行结果以 logs / status update 回填\n\n\n理由：\n\n- Git 对 Markdown 的版本化、diff、merge、review 更天然；\n- Coding Agent 对 Git 仓库的读取和修改最顺；\n- LLM Wiki 可以直接以该仓库作为知识源；\n- Agent Inbox 与 LLM Wiki 可以共享一套文件结构；\n- Drive / Dropbox / Notion 更适合作为补充入口，而不是主存储。

⸻

11. 下一步设计顺序

建议依次展开：

1. Git-first Inbox + LLM Wiki 文件层级设计；\n2. Handoff Schema 设计；\n3. Handoff Skill 设计：如何从 ChatGPT 讨论生成可投递文档；\n4. Processor 设计：raw → handoff → wiki nodes → agent views；\n5. Codex/Kiro/Claude Adapter 设计；\n6. 用户交互流程设计；\n7. 投递方式设计：手动、GitHub Issue、GitHub App、自建 API、ChatGPT connector；\n8. MVP 开发任务拆分。

⸻

12. Git-first Agent Inbox：文件结构设计

12.1 仓库定位

建议单独建立一个 private GitHub 仓库：

agent-inbox

它不是业务代码仓库，也不是普通知识库，而是一个面向 AI Agent 的需求中转仓库。

它承担四类职责：

1. 接收 ChatGPT / Chatbot 讨论后形成的 raw handoff；
2. 将 raw handoff 加工成规范化 handoff；
3. 将 handoff 中可复用的信息沉淀为 LLM Wiki 节点；
4. 为 Codex / Kiro / Claude Code 生成不同的 agent view。

⸻

12.2 第一版推荐目录结构

agent-inbox/
  README.md
  AGENTS.md
  inbox/
    raw/
    triage/
    discarded/
  handoffs/
    pending/
    ready/
    in-progress/
    implemented/
    verified/
    archived/
  wiki/
    concepts/
    decisions/
    systems/
    open-questions/
    glossary/
  agent-views/
    codex/
      latest.md
      pending-index.md
      ready-index.md
    kiro/
      specs/
    claude/
      latest.md
      pending-index.md
  logs/
    processor-runs/
    agent-runs/
  indexes/
    by-project.md
    by-system.md
    by-status.md
    by-tag.md
  skills/
    handoff/
      README.md
      handoff-template.md
      extraction-rules.md
      classification-rules.md
      wiki-linking-rules.md
      agent-view-rules.md
      quality-checklist.md

⸻

12.3 各目录职责

inbox/raw

用于接收原始投递。

特点：

* 可以粗糙；
* 可以还没有完全整理；
* 允许保留部分讨论痕迹；
* 不要求马上可执行；
* 不直接给 Coding Agent 消费。

示例：

inbox/raw/2026-04-30_reel-applied-force.raw.md

⸻

inbox/triage

用于放置已经经过初步分类、但还没正式转成 handoff 的材料。

适合存放：

* 概念片段；
* 半成熟需求；
* 待判断是否进入 handoff 的材料；
* 需要补充信息的讨论。

⸻

handoffs/pending

已经被整理为标准 handoff，但还没有确认可以交给 Agent 执行。

这是最重要的状态之一。

含义：

已经结构化，但还不能自动开工。

常见原因：

* 还缺代码入口；
* 验收标准不够明确；
* 设计边界还需人确认；
* 只是方案草案。

⸻

handoffs/ready

可以交给 Coding Agent 执行。

进入 ready 的最低条件：

1. 一句话目标清楚；
2. 做什么 / 不做什么清楚；
3. 验收标准清楚；
4. 未决问题不阻塞实现；
5. 有明确的 Agent 指令；
6. 已生成对应 agent view。

⸻

handoffs/in-progress

Agent 已经接手。

可以通过文件移动、frontmatter 状态变更、commit message 或 agent-run log 标记。

⸻

handoffs/implemented

代码已经修改，但还未被人工或自动验证完全确认。

⸻

handoffs/verified

已经通过测试、人工确认或版本验证。

⸻

handoffs/archived

历史归档。保留用于追溯，不再出现在 ready/pending 默认索引中。

⸻

wiki/concepts

稳定概念节点。

例如：

wiki/concepts/reel-applied-force.md
wiki/concepts/线长追赶.md
wiki/concepts/物理表现层.md
wiki/concepts/核心公式层.md

概念节点用于跨 handoff 复用。

⸻

wiki/decisions

稳定决策节点。

例如：

wiki/decisions/2026-04-30_搏鱼系统采用核心公式层与物理表现层分离.md

决策节点应该记录：

* 做了什么决定；
* 为什么这样决定；
* 替代方案是什么；
* 影响哪些系统；
* 来源于哪些 handoff。

⸻

wiki/systems

系统级索引节点。

例如：

wiki/systems/fishing-physics.md
wiki/systems/fake-fight.md
wiki/systems/strike-system.md

系统节点负责汇总：

* 相关概念；
* 相关决策；
* 相关 handoff；
* 当前 pending/ready 任务；
* 关键未决问题。

⸻

wiki/open-questions

未决问题节点。

例如：

wiki/open-questions/张力平滑强度与release-time关系.md

未决问题不应该藏在 handoff 深处，而应该独立成节点，便于后续被反复追踪。

⸻

agent-views

给不同 Agent 的消费视图。

这层非常关键。

不要让 Codex / Kiro / Claude Code 直接吃完整 wiki。它们应该先吃裁剪过的、任务导向的视图。

⸻

12.4 推荐的状态流转与文件移动

inbox/raw
  ↓ processor
inbox/triage
  ↓ processor / human confirm
handoffs/pending
  ↓ mark ready
handoffs/ready
  ↓ agent starts
handoffs/in-progress
  ↓ agent completes
handoffs/implemented
  ↓ verify
handoffs/verified
  ↓ archive
handoffs/archived

第一版可以不真的移动文件，只改 frontmatter 的 status。
但从可读性看，移动文件夹更直观。

建议折中：

文件夹表示主状态
frontmatter 表示细状态

例如：

status: pending
substatus: needs-code-entry

⸻

13. Markdown 类型与 Frontmatter 设计

13.1 Raw Handoff

路径：

inbox/raw/<date>_<slug>.raw.md

frontmatter：

type: raw_handoff
id: raw-20260430-reel-applied-force
title: reel.appliedForce 与线长追赶
project: fishing-game
system: fishing-physics
source: chatgpt
status: raw
created_at: 2026-04-30
tags:
  - physics
  - fight
  - reel

正文结构：

# Raw Handoff: reel.appliedForce 与线长追赶
## Source Context
这份文档来自 ChatGPT 中的一次需求讨论。
## Raw Summary
...
## Important Discussion Fragments
...
## Initial Candidate Conclusions
...
## Possible Next Processing
- convert_to_handoff
- extract_wiki_nodes
- generate_agent_views

⸻

13.2 Processed Handoff

路径：

handoffs/pending/<date>_<slug>.md
handoffs/ready/<date>_<slug>.md

frontmatter：

type: handoff
id: handoff-20260430-reel-applied-force
title: reel.appliedForce 与线长追赶
project: fishing-game
system: fishing-physics
status: pending
substatus: needs-human-review
source_raw: inbox/raw/2026-04-30_reel-applied-force.raw.md
created_at: 2026-04-30
updated_at: 2026-04-30
tags:
  - physics
  - fight
  - reel
  - line-length
related_concepts:
  - wiki/concepts/reel-applied-force.md
  - wiki/concepts/线长追赶.md
related_decisions:
  - wiki/decisions/2026-04-30_搏鱼系统采用核心公式层与物理表现层分离.md
open_questions:
  - wiki/open-questions/张力平滑强度与release-time关系.md
agent_views:
  codex: agent-views/codex/handoff-20260430-reel-applied-force.md
  kiro: agent-views/kiro/specs/reel-applied-force/
  claude: agent-views/claude/handoff-20260430-reel-applied-force.md

正文结构：

# AI Handoff: reel.appliedForce 与线长追赶
## 0. 一句话目标
...
## 1. 当前结论
...
## 2. 设计边界
### 做
...
### 不做
...
## 3. 核心机制
...
## 4. 数据结构 / 命名
...
## 5. 公式 / 伪代码
...
## 6. 代码修改建议
...
## 7. 验收标准
...
## 8. 风险点
...
## 9. 未决问题
...
## 10. 给 Coding Agent 的指令
...

⸻

13.3 Concept Node

路径：

wiki/concepts/<concept-name>.md

frontmatter：

type: concept
id: concept-reel-applied-force
title: reel.appliedForce
system: fishing-physics
status: active
created_at: 2026-04-30
updated_at: 2026-04-30
tags:
  - physics
  - reel
source_handoffs:
  - handoffs/pending/2026-04-30_reel-applied-force.md
related:
  - wiki/concepts/线长追赶.md
  - wiki/concepts/物理表现层.md

正文结构：

# reel.appliedForce
## Definition
...
## Why It Exists
...
## Usage Rules
...
## Related Decisions
...
## Related Handoffs
...

⸻

13.4 Decision Node

路径：

wiki/decisions/<date>_<decision-title>.md

frontmatter：

type: decision
id: decision-20260430-fight-core-presentation-split
title: 搏鱼系统采用核心公式层与物理表现层分离
system: fake-fight
status: active
decided_at: 2026-04-30
source_handoffs:
  - handoffs/pending/2026-04-30_reel-applied-force.md
related_concepts:
  - wiki/concepts/核心公式层.md
  - wiki/concepts/物理表现层.md

正文结构：

# Decision: 搏鱼系统采用核心公式层与物理表现层分离
## Decision
...
## Context
...
## Rationale
...
## Alternatives Considered
...
## Consequences
...
## Related Handoffs
...

⸻

13.5 Open Question Node

路径：

wiki/open-questions/<question-title>.md

frontmatter：

type: open_question
id: oq-release-time-tension-smoothing
status: open
system: fishing-physics
created_at: 2026-04-30
priority: medium
blocks_ready_for_agent: false
related_handoffs:
  - handoffs/pending/2026-04-30_reel-applied-force.md

正文结构：

# Open Question: 张力平滑强度与 release_time 的关系
## Question
...
## Why It Matters
...
## Current Hypothesis
...
## What Would Resolve It
...
## Blocking Status
是否阻塞当前 handoff 进入 ready：否。

⸻

14. Handoff Skill 设计

14.1 Skill 定位

Handoff Skill 是系统质量的核心。

它的任务不是“把聊天记录整理成漂亮 Markdown”，而是稳定完成：

长讨论 → 可投递 raw handoff → 规范 handoff → wiki nodes → agent views

⸻

14.2 Skill 文件结构

skills/handoff/
  README.md
  handoff-template.md
  extraction-rules.md
  classification-rules.md
  wiki-linking-rules.md
  agent-view-rules.md
  quality-checklist.md

⸻

14.3 README.md

说明这个 skill 的总体目标。

建议内容：

# Handoff Skill
This skill converts long-form design discussions into structured AI handoff documents.
It must preserve:
- decisions;
- constraints;
- boundaries;
- open questions;
- acceptance criteria;
- agent instructions.
It must remove:
- redundant conversational turns;
- emotional noise;
- repeated explanations;
- implementation guesses not supported by the discussion.

⸻

14.4 extraction-rules.md

规定如何从讨论中抽取内容。

核心规则：

# Extraction Rules
## Extract as Decision
A statement should be extracted as a decision if it:
- settles a design direction;
- rejects a competing approach;
- defines a system boundary;
- defines a naming convention;
- changes implementation priority.
## Extract as Constraint
A statement should be extracted as a constraint if it:
- limits what the agent may change;
- defines what must not be implemented;
- protects compatibility;
- prevents over-engineering.
## Extract as Open Question
A statement should be extracted as an open question if it:
- remains unresolved;
- may affect implementation;
- requires human/product/engineering confirmation;
- is explicitly described as uncertain.
## Extract as Acceptance Criteria
A statement should be extracted as acceptance criteria if it:
- defines observable behavior;
- defines a testable condition;
- defines a compile/runtime/check requirement;
- defines what counts as done.

⸻

14.5 classification-rules.md

规定文档状态如何判断。

# Classification Rules
## raw
The material is newly captured and has not been processed.
## pending
The handoff is structured but not ready for a coding agent.
Use pending if:
- acceptance criteria are unclear;
- code entry points are missing;
- major open questions block implementation;
- design boundaries are ambiguous.
## ready
The handoff can be given to a coding agent.
Use ready only if:
- goal is clear;
- do / do-not boundaries are clear;
- acceptance criteria are testable;
- open questions do not block implementation;
- agent view has been generated.
## discarded
Use discarded if the material is obsolete, duplicated, or explicitly rejected.

⸻

14.6 wiki-linking-rules.md

规定什么时候生成 wiki 节点。

# Wiki Linking Rules
Create a concept node when:
- a term appears repeatedly;
- a term affects multiple handoffs;
- a term defines a system abstraction;
- a term is likely to be reused by future agents.
Create a decision node when:
- the discussion settles a design direction;
- the decision affects future implementation;
- the decision rejects an alternative;
- the decision should be remembered beyond one task.
Create an open question node when:
- an unresolved issue may recur;
- it may affect implementation later;
- it should not be buried in a single handoff.
Do not create wiki nodes for:
- one-off wording;
- low-value examples;
- temporary emotional context;
- implementation guesses not grounded in the discussion.

⸻

14.7 agent-view-rules.md

规定如何为不同 Agent 生成消费视图。

# Agent View Rules
## Codex View
Codex view should focus on:
- implementation target;
- likely files/classes/functions;
- constraints;
- minimal change plan;
- tests or checks;
- do-not rules.
## Kiro View
Kiro view should be split into:
- requirements.md;
- design.md;
- tasks.md.
## Claude Code View
Claude Code view should emphasize:
- read first;
- summarize understanding;
- inspect code before editing;
- produce plan;
- modify only after plan;
- run checks;
- report risks.

⸻

14.8 quality-checklist.md

用于判断 handoff 是否合格。

# Handoff Quality Checklist
A handoff is acceptable only if it answers:
- What is the goal?
- Why does this change exist?
- What should be changed?
- What must not be changed?
- What names or concepts must be preserved?
- What is the minimal implementation direction?
- What are the acceptance criteria?
- What risks exist?
- What questions remain unresolved?
- Which agent view should consume it?

⸻

15. 第一版 MVP：最小可运行闭环

15.1 MVP 目标

第一版只追求一件事：

让 ChatGPT 中推敲出来的需求，能够以 Markdown 形式进入 GitHub agent-inbox 仓库，并被 Coding Agent 稳定读取。

⸻

15.2 MVP 流程

flowchart LR
    A[ChatGPT 讨论] --> B[Handoff Skill 生成 raw handoff]
    B --> C[提交到 GitHub inbox/raw]
    C --> D[Processor 生成 processed handoff]
    D --> E[生成 agent-views/codex/latest.md]
    E --> F[Codex clone/pull 后读取]

⸻

15.3 MVP 暂时不解决的问题

暂时不解决：

1. ChatGPT 是否能完全自动 push 到 GitHub；
2. 多 Agent 同时协作；
3. 自动 PR；
4. 完整 LLM Wiki UI；
5. 完美双链；
6. 自动判断所有相关代码入口。

这些可以后续阶段解决。

⸻

15.4 MVP 必须实现的文件

agent-inbox/
  README.md
  AGENTS.md
  inbox/raw/.gitkeep
  handoffs/pending/.gitkeep
  handoffs/ready/.gitkeep
  wiki/concepts/.gitkeep
  wiki/decisions/.gitkeep
  wiki/systems/.gitkeep
  wiki/open-questions/.gitkeep
  agent-views/codex/latest.md
  agent-views/codex/pending-index.md
  skills/handoff/README.md
  skills/handoff/handoff-template.md
  skills/handoff/extraction-rules.md
  skills/handoff/classification-rules.md
  skills/handoff/wiki-linking-rules.md
  skills/handoff/agent-view-rules.md
  skills/handoff/quality-checklist.md

⸻

15.5 MVP 的第一条真实用例

建议第一条真实用例就是：

reel.appliedForce 与线长追赶

原因：

1. 这是一个真实需求；
2. 有清晰的设计边界；
3. 有物理表现层 / 核心公式层的架构关系；
4. 有概念节点价值；
5. 有 Agent 执行价值；
6. 后续可以反复验证这套流程是否顺手。

⸻

16. 当前最应该继续细化的问题

下一步建议不是继续发散，而是进入具体设计：

1. agent-inbox 仓库的完整初始文件；
2. skills/handoff 每个文件的完整内容；
3. 第一条真实 raw handoff 的样例；
4. Processor 的最小规则；
5. Codex view 的格式；
6. Kiro spec 的格式；
7. 如何从 GitHub repo 被 LLM Wiki 读取。
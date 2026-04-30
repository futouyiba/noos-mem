# Agent Inbox：从 ChatGPT 到 Coding Agent 的需求中转层

> 调优版。原始思路见 [originalThoughts.md](./originalThoughts.md)。

## 0. 一句话定义

Agent Inbox 是一个 Git-first 的需求中转仓库。它把 ChatGPT 中推敲出的决策、边界、验收标准，结构化为 Handoff 对象，供 Coding Agent 稳定消费。

---

## 1. 核心原则

### 1.1 ChatGPT 负责推敲，不负责文件管理

ChatGPT 的职责止于：推敲需求 → 提炼决策 → 形成 Handoff 文档。不要求它直接写入本地仓库。

### 1.2 Handoff 是一等对象，文件只是视图

核心对象不是 Markdown 文件，而是 Handoff：

```
Handoff {
  id, title, project, system, status,
  source, summary, decisions, constraints,
  open_questions, acceptance_criteria,
  related_nodes, created_at, updated_at
}
```

Markdown、Kiro spec、Codex prompt、Claude command 都只是 Handoff 的不同渲染格式。

### 1.3 不是所有讨论都该进入开发

需求必须经过状态机过滤。有些讨论只是概念，有些是决策，有些才是可执行任务。

### 1.4 Frontmatter 是唯一状态源

文件不因状态变更而移动目录。状态完全由 frontmatter 中的 `status` 字段管理。

理由：
- 文件移动破坏 Git rename tracking；
- 双链引用路径会因移动而失效；
- `grep -r "status: ready"` 比扫描目录结构更可靠；
- 索引文件（`indexes/by-status.md`）可自动生成，提供目录级可读性。

---

## 2. 总体架构

```
ChatGPT 深度讨论
  ↓
Handoff Skill 生成 raw handoff Markdown
  ↓
人工 commit 到 GitHub agent-inbox 仓库 inbox/
  ↓
Processor Agent 读取 raw handoff + 已有知识库 → 生成 processed handoff / wiki nodes / agent view
  ↓
Coding Agent git pull 后读取 agent view → 执行 → 回填
```

### 四个角色，各司其职

| 角色 | 是谁 | 职责 | 能力边界 |
|------|------|------|---------|
| **ChatGPT** | 对话式 LLM | 推敲需求、提炼决策、生成 raw handoff | 只看当前对话，看不到知识库全貌 |
| **Processor Agent** | 能访问仓库的 LLM Agent（Kiro / Claude Code 等） | 关联已有知识、生成 wiki nodes、生成 agent view、更新索引 | 能读写 Git 仓库，能渐进式读取 |
| **Coding Agent** | Codex / Kiro / Claude Code | 读取 agent view、执行代码修改、回填结果 | 面向业务代码仓库 |
| **人** | 你 | 投递、确认状态流转、质量把关 | 最终决策权 |

### 为什么 Processor 不能是 ChatGPT

ChatGPT 能生成一份 handoff，但它**看不到你的知识库全貌**。Processor 要做的是拿着一份新文档，去扫描已有的知识体系，建立关联。这需要：

1. **访问完整仓库**——读取 wiki/concepts/、wiki/decisions/、handoffs/ 里的已有文件
2. **渐进式读取**——知识库会越来越大，不可能全量塞进 context，需要先读索引再按需深入
3. **语义关联判断**——这个新概念和已有的哪个概念是同一个？这个决策是新的还是对旧决策的修订？
4. **写回能力**——在已有节点里补充反向链接，更新索引文件

ChatGPT 做不到 1 和 4（没有仓库访问权）。Python 脚本能做 1 和 4，但做不了 2 和 3 的语义判断。所以 Processor 必须是一个**能访问本地仓库的 LLM Agent**。

最合适的宿主是 Kiro 或 Claude Code——它们天然能读写 Git 仓库，有渐进式文件读取能力，有工具调用能力。Processor 本质上是一个跑在 Coding Agent 环境里的**知识整理任务**，和代码修改任务共享同一套基础设施，但执行不同的 prompt/skill。

### 关键简化（相对原始设计）

| 原始设计 | 调优后 |
|---------|--------|
| 5 层架构（Capture → Inbox → Sync → Processor → Adapter） | 4 层：Capture → Inbox Store → Process → Agent Consume |
| Local Sync Daemon 监听网盘 | 删除。Git-first 下同步 = `git pull` |
| Processor 角色不清（脚本？服务？LLM？） | 明确为能访问仓库的 LLM Agent |
| 三套 Agent Adapter 模板 | MVP 只做一个通用 agent view |

---

## 3. 状态机

```
raw → triaged → ready → in-progress → implemented → verified → archived
  ↘      ↘        ↘
   discarded  discarded  blocked (open questions)
                            ↓
                          ready (补充信息后)
```

### 状态定义

| 状态 | 含义 | 进入条件 |
|------|------|---------|
| `raw` | 刚投递，未经处理 | ChatGPT 生成并 commit |
| `triaged` | 已结构化，但不可执行 | 缺验收标准 / 代码入口 / 设计边界 |
| `ready` | 可交给 Agent 执行 | 目标清晰 + 边界清晰 + 验收标准可测 + 未决问题不阻塞 |
| `in-progress` | Agent 已接手 | Agent 开始工作 |
| `implemented` | 代码已修改，待验证 | Agent 完成修改 |
| `verified` | 已通过测试/人工确认 | 验证通过 |
| `archived` | 历史归档 | 不再活跃 |
| `discarded` | 废弃 | 过时 / 重复 / 明确拒绝 |
| `blocked` | 关键问题未决 | open question 阻塞实现 |

---

## 4. 仓库结构

```
agent-inbox/
  README.md
  AGENTS.md

  inbox/                          # 原始投递区
    <date>_<slug>.raw.md

  handoffs/                       # 结构化 handoff（所有状态）
    <date>_<slug>.md

  wiki/                           # 知识沉淀
    concepts/
    decisions/
    systems/
    open-questions/

  agent-views/                    # Agent 消费视图
    latest.md                     # 当前最高优先级 ready handoff
    pending-index.md              # 所有非 archived 的 handoff 索引

  logs/                           # 执行回填
    agent-runs/

  indexes/                        # 自动生成的索引
    by-project.md
    by-status.md
    by-tag.md
```

### 相对原始设计的简化

| 原始设计 | 调优后 | 理由 |
|---------|--------|------|
| `handoffs/pending/`、`handoffs/ready/` 等 6 个子目录 | `handoffs/` 单目录，状态靠 frontmatter | 避免文件移动 |
| `agent-views/codex/`、`agent-views/kiro/`、`agent-views/claude/` | `agent-views/latest.md` 单文件 | MVP 只需一个通用视图 |
| `skills/handoff/` 放在 inbox 仓库 | 移到 llm_wiki 仓库或 ChatGPT 配置 | skills 是给生成者看的，不是给消费者看的 |
| `inbox/raw/`、`inbox/triage/`、`inbox/discarded/` | `inbox/` 单目录 | raw 文件不需要子状态目录 |

---

## 5. Frontmatter 设计

### 5.1 Raw Handoff

路径：`inbox/<date>_<slug>.raw.md`

```yaml
---
type: raw_handoff
id: raw-20260430-reel-applied-force
title: reel.appliedForce 与线长追赶
project: fishing-game
system: fishing-physics
source: chatgpt
status: raw
created_at: 2026-04-30
tags: [physics, fight, reel]
---
```

正文结构：

```markdown
# Raw Handoff: reel.appliedForce 与线长追赶
## Source Context
## Raw Summary
## Key Discussion Fragments
## Candidate Conclusions
```

### 5.2 Processed Handoff

路径：`handoffs/<date>_<slug>.md`

```yaml
---
type: handoff
id: handoff-20260430-reel-applied-force
title: reel.appliedForce 与线长追赶
project: fishing-game
system: fishing-physics
status: triaged              # raw | triaged | ready | in-progress | implemented | verified | archived | discarded | blocked
source_raw: inbox/2026-04-30_reel-applied-force.raw.md
created_at: 2026-04-30
updated_at: 2026-04-30
tags: [physics, fight, reel, line-length]
related_concepts:
  - wiki/concepts/reel-applied-force.md
  - wiki/concepts/line-length-chase.md
related_decisions:
  - wiki/decisions/2026-04-30_fight-core-presentation-split.md
open_questions:
  - wiki/open-questions/tension-smoothing-vs-release-time.md
---
```

正文结构（Handoff 标准格式）：

```markdown
# AI Handoff: <标题>
## 0. 一句话目标
## 1. 当前结论
## 2. 设计边界
### 做
### 不做
## 3. 核心机制
## 4. 数据结构 / 命名
## 5. 公式 / 伪代码
## 6. 代码修改建议
## 7. 验收标准
## 8. 风险点
## 9. 未决问题
## 10. 给 Coding Agent 的指令
```

### 5.3 Wiki 节点

**Concept Node** — `wiki/concepts/<slug>.md`

```yaml
---
type: concept
id: concept-reel-applied-force
title: reel.appliedForce
system: fishing-physics
status: active
source_handoffs: [handoffs/2026-04-30_reel-applied-force.md]
related: [wiki/concepts/line-length-chase.md]
---
```

**Decision Node** — `wiki/decisions/<date>_<slug>.md`

```yaml
---
type: decision
id: decision-20260430-fight-core-presentation-split
title: 搏鱼系统采用核心公式层与物理表现层分离
system: fake-fight
status: active
decided_at: 2026-04-30
source_handoffs: [handoffs/2026-04-30_reel-applied-force.md]
---
```

**Open Question Node** — `wiki/open-questions/<slug>.md`

```yaml
---
type: open_question
id: oq-tension-smoothing-release-time
status: open
system: fishing-physics
priority: medium
blocks_ready: false
related_handoffs: [handoffs/2026-04-30_reel-applied-force.md]
---
```

---

## 6. 命名规范

| 元素 | 规范 | 示例 |
|------|------|------|
| 文件名 | `<date>_<kebab-case-slug>.md` | `2026-04-30_reel-applied-force.md` |
| Raw 文件名 | 加 `.raw.md` 后缀 | `2026-04-30_reel-applied-force.raw.md` |
| ID | `<type>-<YYYYMMDD>-<slug>` | `handoff-20260430-reel-applied-force` |
| 中文标题 | 放 frontmatter `title` 字段 | `title: reel.appliedForce 与线长追赶` |
| Wiki 概念 | kebab-case，不带日期 | `wiki/concepts/reel-applied-force.md` |

---

## 7. Handoff Skill（生成规则）

Handoff Skill 是给 ChatGPT（或任何生成 handoff 的 LLM）使用的 prompt 工程规则集。

> 注意：这些规则不放在 agent-inbox 仓库里，而是放在 llm_wiki 仓库或 ChatGPT 自定义指令中。agent-inbox 仓库只存放产出物。

### 7.1 抽取规则

| 抽取为 | 条件 |
|--------|------|
| Decision | 确定设计方向 / 否决替代方案 / 定义系统边界 / 定义命名规范 |
| Constraint | 限制 Agent 可改范围 / 定义不做什么 / 保护兼容性 |
| Open Question | 未解决 / 可能影响实现 / 需要人确认 / 明确标记为不确定 |
| Acceptance Criteria | 定义可观测行为 / 可测试条件 / 编译/运行时检查 / 完成标准 |

### 7.2 分类规则

| 状态 | 判断条件 |
|------|---------|
| `raw` | 刚捕获，未处理 |
| `triaged` | 已结构化，但验收标准不清 / 缺代码入口 / 设计边界模糊 |
| `ready` | 目标清晰 + 边界清晰 + 验收标准可测 + 未决问题不阻塞 |
| `discarded` | 过时 / 重复 / 明确拒绝 |

### 7.3 Wiki 节点生成规则

**生成节点**：术语反复出现 / 跨 handoff 复用 / 定义系统抽象 / 未来 Agent 可能需要。

**不生成节点**：一次性措辞 / 低价值示例 / 临时情绪语境 / 无讨论依据的实现猜测。

### 7.4 质量检查清单

一份 handoff 必须回答以下问题才算合格：

1. 目标是什么？
2. 为什么要做这个变更？
3. 应该改什么？
4. 不能改什么？
5. 哪些命名/概念必须保留？
6. 最小实现方向是什么？
7. 验收标准是什么？
8. 风险是什么？
9. 哪些问题未解决？

---

## 8. Agent View 格式

MVP 阶段只维护一个通用 agent view：`agent-views/latest.md`。

```markdown
# Agent View: <标题>

> 自动生成自 handoffs/<date>_<slug>.md，请勿手动编辑。

## 目标
<一句话目标>

## 代码入口
- 文件：...
- 类/函数：...

## 做什么
- ...

## 不做什么
- ...

## 验收标准
- [ ] ...

## 最小改动方案
1. ...

## 风险点
- ...

## 未决问题（不阻塞实现）
- ...

## Agent 指令
1. 定位相关代码；
2. 复述你对需求的理解；
3. 给出最小修改方案；
4. 低风险时再进行代码修改；
5. 修改后运行编译/测试；
6. 输出变更摘要和未解决问题。
```

后续阶段再按需增加 Kiro spec 格式（requirements.md / design.md / tasks.md）和 Claude Code 格式（.claude/commands/）。

---

## 9. MVP：最小可运行闭环

### 9.1 MVP 验证两个假设

> 假设 A：结构化 Handoff 能否真的指导 Coding Agent 产出高质量代码？
>
> 假设 B：Processor Agent 能否基于已有知识库为新 handoff 建立有意义的关联？

### 9.2 MVP 流程

```
ChatGPT 讨论
  ↓
按 Handoff Skill 规则生成 raw handoff
  ↓
人工 git commit 到 agent-inbox/inbox/
  ↓
Processor Agent（Kiro/Claude Code）读取 raw handoff + 已有 wiki
  → 生成 processed handoff（handoffs/）
  → 生成/更新 wiki nodes（wiki/）
  → 生成 agent view（agent-views/latest.md）
  → 更新索引（indexes/）
  ↓
Coding Agent git pull 后读取 agent-views/latest.md
```

### 9.3 MVP 必须实现的文件

```
agent-inbox/
  README.md
  AGENTS.md
  inbox/.gitkeep
  handoffs/.gitkeep
  wiki/concepts/.gitkeep
  wiki/decisions/.gitkeep
  wiki/systems/.gitkeep
  wiki/open-questions/.gitkeep
  agent-views/latest.md
  agent-views/pending-index.md
  logs/agent-runs/.gitkeep
  indexes/.gitkeep
```

### 9.4 MVP 暂不做

- 投递自动化（ChatGPT 自动 push 到 GitHub）
- 多 Agent 同时协作
- 自动 PR
- 完整双链一致性保证
- Web UI
- 向量数据库
- Agent 执行后自动回填 log（手动回填即可）

### 9.5 第一条真实用例

`reel.appliedForce 与线长追赶`——真实需求，有清晰边界，有概念节点价值，适合验证全流程。

### 9.6 MVP 中 Processor Agent 的最小行为

MVP 阶段 Processor Agent 不需要复杂策略，只需完成以下步骤：

1. 读取 `inbox/` 中新增的 raw handoff
2. 读取 `indexes/by-project.md` 和 `indexes/by-tag.md`（如果存在）了解已有知识概况
3. 按需读取 `wiki/concepts/`、`wiki/decisions/` 中可能相关的节点
4. 生成 processed handoff → 写入 `handoffs/`
5. 生成或更新 wiki 节点 → 写入 `wiki/`
6. 生成 agent view → 写入 `agent-views/latest.md`
7. 更新索引文件
8. git commit

这个流程可以用一条 Kiro steering 规则或 Claude Code command 来触发。

---

## 10. 演进路线

| Phase | 目标 | 关键动作 |
|-------|------|---------|
| **1. 手动闭环** | 链路跑通 | ChatGPT 生成 raw handoff → 人工 commit → Processor Agent 加工 → Coding Agent 读取 |
| **2. Processor 策略迭代** | 关联质量提升 | 优化渐进式读取策略、关联判断规则、索引更新逻辑 |
| **3. 投递自动化** | 降低摩擦 | GitHub Issue / ChatGPT connector / 自建 API |
| **4. Agent 自动消费** | Agent 启动时自动发现 | Agent 读取 pending-index，自动选择 ready handoff |
| **5. 闭环回填** | 结果进知识库 | 变更摘要、测试结果、失败原因、剩余风险 |
| **6. 多 Agent Adapter** | 格式适配 | Kiro spec、Claude commands、Codex AGENTS.md |

---

## 11. 与 LLM Wiki 的关系

agent-inbox 仓库和 llm_wiki 仓库是两个独立仓库，职责不同：

| | agent-inbox | llm_wiki |
|---|---|---|
| 核心内容 | Handoff（需求意图） | 知识节点（概念、决策、规则） |
| 消费者 | Coding Agent | 所有 LLM（包括 ChatGPT） |
| 生命周期 | 有状态机，会归档 | 长期积累，持续更新 |
| Handoff Skill 规则 | 不存放 | 存放在此 |

`wiki/` 目录是 agent-inbox 中的知识沉淀区，内容可以双向同步到 llm_wiki 仓库。具体同步机制在 Phase 2+ 设计。

---

## 12. 待后续设计的模块

按优先级排序：

1. **agent-inbox 仓库初始化**：创建 README、AGENTS.md、目录骨架
2. **Processor Agent 的 steering/command 设计**：触发方式、渐进式读取策略、关联判断规则
3. **Handoff Skill 完整规则**：放入 llm_wiki 仓库
4. **第一条真实 handoff**：reel.appliedForce 用例，走完 raw → processed → agent view 全流程
5. **Agent View 生成规则**：从 handoff 到 latest.md 的转换逻辑
6. **Kiro spec adapter**：handoff → requirements.md / design.md / tasks.md
7. **投递自动化**：GitHub Issue template / ChatGPT connector

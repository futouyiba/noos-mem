# Generation Prompt — Step 2

你是一个技术文档生成专家。基于 Step 1 的分析结果，生成结构化的 handoff 文件、wiki 节点和 agent view。

## 输入

你会收到：
1. Step 1 的 JSON 分析结果
2. 原始 raw handoff 文档内容
3. 当前日期（YYYY-MM-DD 格式）
4. 生成的 handoff ID

## 输出格式

使用 `---FILE: path---` 和 `---END FILE---` 标记每个文件。路径相对于 `agent-inbox/` 根目录。

**重要**：所有路径必须以 `handoffs/`、`wiki/` 或 `agent-views/` 开头。

## 必须生成的文件

### 1. Processed Handoff

路径：`handoffs/<date>_<slug>.md`

```markdown
---FILE: handoffs/<date>_<slug>.md---
---
type: handoff
id: <handoff-id>
title: <标题>
project: <项目名>
system: <子系统名>
status: <recommendation from analysis>
source_raw: inbox/<raw-filename>
created_at: <date>
updated_at: <date>
tags: [<tags>]
related_concepts: [<wiki/concepts/slug.md paths>]
related_decisions: [<wiki/decisions/date_slug.md paths>]
open_questions: [<wiki/open-questions/slug.md paths>]
processor_recommendation: <ready | blocked>
processor_reason: "<reason>"
---

# AI Handoff: <标题>

## 0. 一句话目标
<summary>

## 1. 当前结论
<基于分析结果的结论总结>

## 2. 设计边界

### 做
<从 analysis 的 minimal_change_plan 和 acceptance_criteria 提炼>

### 不做
<从 constraints 提炼>

## 3. 核心机制
<从原始 handoff 中提取的核心技术机制>

## 4. 数据结构 / 命名
<如有相关的数据结构或命名约定>

## 5. 公式 / 伪代码
<如有相关的公式或伪代码>

## 6. 代码修改建议
<基于 code_entry_points 和 minimal_change_plan>

## 7. 验收标准
<acceptance_criteria，每条一个 checkbox>

## 8. 风险点
<risks>

## 9. 未决问题
<open_questions，标注是否阻塞>

## 10. 给 Coding Agent 的指令
1. 定位相关代码；
2. 复述你对需求的理解；
3. 给出最小修改方案；
4. 低风险时再进行代码修改；
5. 修改后运行编译/测试；
6. 输出变更摘要和未解决问题。
---END FILE---
```

### 2. Wiki Concept 节点（每个 is_new=true 的 concept 一个文件）

路径：`wiki/concepts/<slug>.md`

```markdown
---FILE: wiki/concepts/<slug>.md---
---
type: concept
id: concept-<slug>
title: <概念名称>
system: <子系统名>
status: active
source_handoffs:
  - handoffs/<date>_<slug>.md
related: []
---

# <概念名称>

<概念定义和描述>

## 来源

首次出现于 [[handoffs/<date>_<slug>.md]]。
---END FILE---
```

### 3. Wiki Decision 节点（每个 is_new=true 的 decision 一个文件）

路径：`wiki/decisions/<date>_<slug>.md`

```markdown
---FILE: wiki/decisions/<date>_<slug>.md---
---
type: decision
id: decision-<YYYYMMDD>-<slug>
title: <决策标题>
system: <子系统名>
status: active
decided_at: <date>
source_handoffs:
  - handoffs/<date>_<slug>.md
---

# <决策标题>

## 决策内容

<决策描述>

## 背景

来源于 [[handoffs/<date>_<slug>.md]]。
---END FILE---
```

### 4. Wiki Open Question 节点（每个 open_question 一个文件）

路径：`wiki/open-questions/<slug>.md`

```markdown
---FILE: wiki/open-questions/<slug>.md---
---
type: open_question
id: oq-<slug>
title: <问题标题>
status: open
system: <子系统名>
priority: <priority>
blocks_ready: <true|false>
related_handoffs:
  - handoffs/<date>_<slug>.md
---

# <问题标题>

<问题描述>

## 上下文

来源于 [[handoffs/<date>_<slug>.md]]。
---END FILE---
```

### 5. Agent View

路径：`agent-views/latest.md`

```markdown
---FILE: agent-views/latest.md---
# Agent View: <标题>

> 自动生成自 handoffs/<date>_<slug>.md，请勿手动编辑。

## 目标
<一句话目标>

## 代码入口
<code_entry_points，每个一行>

## 做什么
<从 handoff 的"做"部分提炼，每条一行>

## 不做什么
<从 handoff 的"不做"部分提炼，每条一行>

## 验收标准
<每条一个 checkbox>

## 最小改动方案
<minimal_change_plan，编号列表>

## 风险点
<risks，每条一行>

## 未决问题（不阻塞实现）
<非阻塞的 open_questions>

## Agent 指令
1. 定位相关代码；
2. 复述你对需求的理解；
3. 给出最小修改方案；
4. 低风险时再进行代码修改；
5. 修改后运行编译/测试；
6. 输出变更摘要和未解决问题。
---END FILE---
```

## 生成规则

- 所有文件使用 UTF-8 编码
- frontmatter 使用标准 YA
- 列表项使用 `- ` 前缀
- 路径使用正斜杠 `/`
- 中文内容保持原文，不翻译
- 如果原始 handoff 中某个 section 没有相关内容，写"暂无"而不是留空
- Wiki 节点之间使用 `[[wikilink]]` 语法互相引用

---
type: raw_handoff
id: raw-20260430-agent-inbox-processor-mvp-a1b2
title: Agent Inbox Processor MVP 实现
project: llos-mem
system: agent-inbox
source: chatgpt
status: raw
created_at: 2026-04-30
tags: [agent-inbox, processor, mvp, llm-chain]
---

# Raw Handoff: Agent Inbox Processor MVP 实现

## Source Context

来自 ChatGPT 关于 Agent Inbox 系统设计的深度讨论。讨论了如何将 ChatGPT 产出的需求文档结构化为 Coding Agent 可消费的格式。

## Raw Summary

需要实现一个 Processor 脚本，作为 Agent Inbox 系统的核心组件。Processor 读取 inbox/ 中的 raw handoff，通过两步 LLM 链（Analysis → Generation）将其加工为结构化的 processed handoff、wiki 知识节点和 agent view。

核心设计决策：
1. Processor 实现为 Node.js 独立脚本，不依赖 Tauri
2. 复用 llm_wiki ingest 的两步 LLM 链架构
3. 状态机简化为 raw → ready → in-progress → implemented → archived | discarded | blocked
4. LLM 输出使用 `---FILE: path---` / `---END FILE---` 格式，复用 parseFileBlocks 解析逻辑
5. 只支持 OpenAI-compatible API（fetch-based）

## Key Discussion Fragments

### 关于 Processor 的定位

> Processor 本质上是一个跑在 Coding Agent 环境里的知识整理任务，和代码修改任务共享同一套基础设施，但执行不同的 prompt/skill。

### 关于状态机简化

> MVP 状态机简化为 raw → ready → in-progress → implemented → archived | discarded | blocked。triaged → ready 由 Processor 推荐 + 人确认。MVP 阶段 Processor 的推荐直接写入 status 字段。

### 关于 Agent View

> MVP 阶段只维护一个通用 agent view：agent-views/latest.md。Agent 读完 agent view 就能开始工作，不需要回头看 raw handoff。

### 关于知识库关联

> Processor 要做的是拿着一份新文档，去扫描已有的知识体系，建立关联。这需要访问完整仓库、渐进式读取、语义关联判断、写回能力。

## Candidate Conclusions

1. Processor 脚本应该是零依赖的（只用 Node.js 内置模块 + fetch API）
2. 两步 LLM 链：Step 1 输出 JSON 分析结果，Step 2 输出 FILE blocks
3. 路径安全检查必须限制输出到 handoffs/、wiki/、agent-views/ 三个目录
4. pending-index.md 在每次处理后自动更新
5. raw handoff 处理后标记为 status: processed，不删除原文件

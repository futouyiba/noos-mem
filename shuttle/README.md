# Shuttle

NOOS（Natural-language Orchestration Operating System）的需求梭子模块——Loom 知识织机的入口。把 ChatGPT 讨论中推敲出的决策、边界、验收标准，结构化为 Handoff 对象，供 Coding Agent 稳定消费。

## 工作流

```
ChatGPT 深度讨论
  ↓
按 Handoff Skill 规则生成 raw handoff
  ↓
人工 commit 到 inbox/
  ↓
Processor 读取 raw handoff + 已有 wiki → 生成 processed handoff / wiki nodes / agent view
  ↓
Coding Agent 读取 agent-views/latest.md → 执行
```

## 状态机

```
raw → ready → in-progress → implemented → archived
 ↘      ↘
  discarded  blocked → ready（补充信息后）
```

| 状态 | 含义 |
|------|------|
| `raw` | 刚投递，未经处理 |
| `ready` | 可交给 Agent 执行（目标清晰 + 边界清晰 + 验收标准可测） |
| `blocked` | 关键问题未决，需补充信息 |
| `in-progress` | Agent 已接手 |
| `implemented` | 代码已修改，待验证 |
| `archived` | 历史归档 |
| `discarded` | 废弃（过时 / 重复 / 明确拒绝） |

## 目录结构

```
shuttle/
├── inbox/              # Raw handoff 投递区
├── handoffs/           # Processed handoff（所有状态，frontmatter 管理）
├── wiki/               # 知识沉淀
│   ├── concepts/
│   ├── decisions/
│   └── open-questions/
├── agent-views/        # Agent 消费视图
│   ├── latest.md       # 当前最高优先级 ready handoff
│   ├── pending-index.md
│   └── context/        # 预生成的上下文包（每个 handoff 一个）
├── indexes/            # 自动生成的知识索引（供 Agent 导航）
│   ├── knowledge-map.md
│   ├── concept-index.md
│   ├── decision-index.md
│   └── system-index.md
├── processor/          # Processor 脚本和配置
│   ├── process.mjs
│   ├── config.json      # 从 config.example.json 复制并填入 API key
│   ├── prompts/
│   └── rules/
└── AGENTS.md           # Coding Agent 知识检索协议
```

## 使用方式

### 1. 配置 LLM

```bash
cd shuttle/processor
cp config.example.json config.json
# 编辑 config.json，填入 API endpoint 和 key
```

### 2. 投递 raw handoff

将 ChatGPT 生成的 raw handoff 放入 `inbox/`，文件名格式：`<date>_<slug>.raw.md`。

frontmatter 必须包含 `type: raw_handoff` 和 `status: raw`。

### 3. 运行 Processor

```bash
node processor/process.mjs
```

Processor 会：
- 扫描 `inbox/` 中 `status: raw` 的文件
- 调用 LLM 进行两步分析（Analysis → Generation）
- 生成 processed handoff 到 `handoffs/`
- 生成 wiki 节点到 `wiki/`
- 更新 `agent-views/latest.md` 和 `agent-views/pending-index.md`
- 生成知识索引到 `indexes/`（knowledge-map, concept-index, decision-index, system-index）
- 生成上下文包到 `agent-views/context/`（每个活跃 handoff 一个）

### 4. Coding Agent 消费

Coding Agent 按 `AGENTS.md` 中的 Retrieval Protocol 渐进式获取上下文：

1. 读 `agent-views/latest.md` → 任务分配
2. 读 `agent-views/context/<slug>-context.md` → 预生成的上下文包（~80% 所需知识）
3. 按需深入 `wiki/` 中的具体节点
4. 参考 `indexes/` 获取系统级全局视图

## Frontmatter 约定

- 状态完全由 frontmatter `status` 字段管理，文件不因状态变更而移动目录
- ID 格式：`<type>-<YYYYMMDD>-<slug>-<4char-hash>`
- frontmatter 预留 `agent_run` 字段位置，用于后续闭环回填

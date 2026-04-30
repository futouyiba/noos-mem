# Agent Inbox

Git-first 的需求中转系统。把 ChatGPT 讨论中推敲出的决策、边界、验收标准，结构化为 Handoff 对象，供 Coding Agent 稳定消费。

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
agent-inbox/
├── inbox/              # Raw handoff 投递区
├── handoffs/           # Processed handoff（所有状态，frontmatter 管理）
├── wiki/               # 知识沉淀
│   ├── concepts/
│   ├── decisions/
│   └── open-questions/
├── agent-views/        # Agent 消费视图
│   ├── latest.md       # 当前最高优先级 ready handoff
│   └── pending-index.md
└── processor/          # Processor 脚本和配置
    ├── process.mjs
    ├── config.json      # 从 config.example.json 复制并填入 API key
    ├── prompts/
    └── rules/
```

## 使用方式

### 1. 配置 LLM

```bash
cd agent-inbox/processor
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

### 4. Coding Agent 消费

Coding Agent 读取 `agent-views/latest.md` 获取当前最高优先级的 ready handoff。

## Frontmatter 约定

- 状态完全由 frontmatter `status` 字段管理，文件不因状态变更而移动目录
- ID 格式：`<type>-<YYYYMMDD>-<slug>-<4char-hash>`
- frontmatter 预留 `agent_run` 字段位置，用于后续闭环回填

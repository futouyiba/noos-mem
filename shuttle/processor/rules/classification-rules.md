# Classification Rules

Processor 对 handoff 进行状态分类的规则。

## 状态判断流程

```
raw handoff 输入
  ↓
是否有阻塞性未决问题（blocks_ready: true）？
  → 是 → blocked
  → 否 ↓
目标是否清晰？（有明确的一句话目标）
  → 否 → blocked（reason: 目标不清晰）
  → 是 ↓
边界是否清晰？（有"做什么"和"不做什么"）
  → 否 → blocked（reason: 边界不清晰）
  → 是 ↓
验收标准是否可测？（至少 1 条可验证的标准）
  → 否 → blocked（reason: 缺少可测试的验收标准）
  → 是 → ready
```

## 状态定义

### `ready`
- 目标清晰：有明确的一句话目标
- 边界清晰：有"做什么"和"不做什么"
- 验收标准可测：至少 1 条可验证的验收标准
- 未决问题不阻塞：所有 open_questions 的 `blocks_ready` 都为 `false`

### `blocked`
- 存在 `blocks_ready: true` 的未决问题
- 或目标/边界/验收标准不满足 ready 条件
- `processor_reason` 应说明具体缺什么

### `discarded`
Processor 不主动设置 discarded。这个状态由人手动设置，用于：
- 过时的需求
- 与已有 handoff 重复
- 明确被拒绝的需求

## Processor 推荐 vs 最终状态

Processor 输出的是 `processor_recommendation`（建议），不是最终状态。

MVP 阶段，Processor 的推荐直接写入 `status` 字段。后续阶段会引入 `triaged` 中间状态，由人确认后才流转到 `ready`。

## 优先级判断（用于 agent-views/latest.md 选择）

当有多个 `ready` handoff 时，按以下规则选择最高优先级：

1. `created_at` 最早的优先（FIFO）
2. 如果日期相同，按文件名字母序

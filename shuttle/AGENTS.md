# AGENTS.md — Shuttle Knowledge Retrieval Protocol

This document tells Coding Agents how to consume Handoffs and progressively retrieve context from the Loom knowledge base.

## Quick Start

```
1. Read agent-views/latest.md           → current highest-priority task
2. Read agent-views/context/<slug>-context.md  → pre-built context package
3. Follow the Retrieval Protocol below if you need more
```

## Retrieval Protocol

When you receive a Handoff, build context in expanding circles:

### Circle 1: Handoff + Context Package

1. READ `agent-views/latest.md` — your task assignment
2. READ the corresponding `agent-views/context/<slug>-context.md` — pre-generated context with summaries of related concepts, decisions, and open questions
3. This gives you ~80% of the context you need. If sufficient, start working.

### Circle 2: Direct References

If the context package isn't enough, follow the Handoff's frontmatter links:

1. READ each file in `related_concepts` (e.g. `wiki/concepts/reel-applied-force.md`)
2. READ each file in `related_decisions` (e.g. `wiki/decisions/2026-04-30_fight-core-presentation-split.md`)
3. READ each file in `open_questions` (e.g. `wiki/open-questions/tension-smoothing-vs-release-time.md`)
4. For each node, check its own `related` field in frontmatter — if any look relevant to your task, read those too

### Circle 3: System-Level Context

If you need broader understanding of the system you're working in:

1. READ `indexes/knowledge-map.md` — global knowledge map grouped by system
2. READ `indexes/system-index.md` — find all nodes belonging to the relevant system
3. READ specific nodes that look relevant from the index

### Circle 4: Search (last resort)

If you still can't find what you need:

1. READ `indexes/concept-index.md` — scan for concepts by keyword
2. READ `indexes/decision-index.md` — scan for relevant decisions
3. Grep the `wiki/` directory for specific terms

## Budget Guidelines

- Aim for **5-15 wiki nodes** per Handoff
- If you're reading more than 20 nodes, you're going too wide — focus on nodes directly referenced by the Handoff
- Prefer depth (following a chain of related nodes) over breadth (reading everything in a system)

## After Execution

When you finish working on a Handoff:

1. Update the Handoff's `status` field in frontmatter (e.g. `in-progress` → `implemented`)
2. If you discovered new concepts, decisions, or open questions during implementation, note them in your output — the Processor will incorporate them in the next run

## File Conventions

- All wiki nodes use YAML frontmatter with `type`, `title`, `status`, `related` fields
- Cross-references use `[[wikilink]]` syntax (Obsidian-compatible)
- Handoff IDs follow the pattern: `<type>-<YYYYMMDD>-<slug>-<4char-hash>`
- Status is managed entirely via frontmatter — files don't move between directories

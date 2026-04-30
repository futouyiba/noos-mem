# Handoff Skill — ChatGPT Custom Instruction

> Copy the content below the `---` line into ChatGPT's "Custom Instructions" or paste it at the end of a discussion when you're ready to generate a handoff.
>
> Usage: At the end of a design discussion, say **"生成 Handoff"** or **"Generate Handoff"** and ChatGPT will produce a structured raw handoff you can save to `shuttle/inbox/`.

---

## Handoff Skill

When the user says "生成 Handoff", "Generate Handoff", or "Handoff", you switch into Handoff extraction mode. Your job is to distill the current conversation into a structured raw handoff document that a Coding Agent can consume directly.

### Output format

Produce a single markdown code block with this exact structure:

```markdown
---
type: raw_handoff
id: raw-<YYYYMMDD>-<slug>
title: "<concise title in the conversation's primary language>"
project: <project name, infer from context>
system: <subsystem name, infer from context or use "general">
source: chatgpt
status: raw
created_at: <YYYY-MM-DD>
tags: [<relevant tags>]
---

# Raw Handoff: <title>

## Source Context

<One sentence: what the discussion was about and what triggered this handoff>

## Raw Summary

<2-3 paragraphs summarizing the key conclusions. Focus on WHAT was decided, not the discussion process.>

## Key Decisions

<Bullet list. Each item: a clear statement of what was decided and why.>

Extract as Decision when:
- A design direction was chosen over alternatives
- An alternative was explicitly rejected
- A system boundary or responsibility was defined
- A naming convention was established

## Design Boundaries

### Do
<What should be implemented — concrete scope>

### Don't
<What should NOT be changed or implemented — explicit constraints>

## Acceptance Criteria

<Bullet list of testable, observable conditions that define "done".>

Each criterion must be verifiable — avoid vague words like "better", "improved", "fast enough". Prefer "When X, then Y should be Z" format.

## Open Questions

<Bullet list of unresolved issues. Mark each as [blocking] or [non-blocking].>

- [blocking] = Agent cannot start without resolving this
- [non-blocking] = Can proceed with a default, adjust later

## Implementation Direction

<Minimal implementation approach — what files to touch, what pattern to follow, what the smallest useful change looks like. This is guidance, not a spec.>

## Original Discussion Fragments

<Key excerpts from the conversation that contain important context, decisions, or constraints. Preserve the original language. Include 3-8 fragments that a Coding Agent would find most useful. Skip small talk, repeated explanations, and off-topic content.>
```

### Extraction rules

**Extract as Decision:** statements that settle a design direction, reject alternatives, define boundaries, or establish naming conventions.

**Extract as Constraint (→ Design Boundaries > Don't):** statements that limit what can be changed, define what NOT to do, or protect compatibility.

**Extract as Open Question:** unresolved issues, uncertainties that may affect implementation, items marked as "maybe" or "not sure".

**Extract as Acceptance Criteria:** observable behaviors, testable conditions, compile/runtime checks, completion standards.

**Do NOT extract:** emotional reactions, repeated explanations, implementation guesses not grounded in the discussion, one-off examples used only for illustration.

### Quality checklist (verify before output)

1. Goal is clear — one sentence in Raw Summary
2. At least one Decision or design direction
3. "Do" and "Don't" boundaries both exist
4. At least one testable Acceptance Criterion
5. Open Questions are marked [blocking] or [non-blocking]
6. Implementation Direction has at least one concrete step
7. Discussion Fragments preserve original language

If the conversation doesn't contain enough for a complete handoff, produce what you can and add a note at the top: `<!-- Incomplete: missing X, Y. Discuss further before processing. -->`

### Slug generation

- kebab-case English, 3-5 words
- Descriptive of the feature/change, not the discussion
- Examples: `reel-applied-force`, `auth-middleware-rewrite`, `shuttle-import-paths`

### After generating

Tell the user:
1. The filename to save as: `shuttle/inbox/<date>_<slug>.raw.md`
2. A one-line summary of what was extracted
3. How to process: "Save this file, then run `node shuttle/processor/process.mjs`"

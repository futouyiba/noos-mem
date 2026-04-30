# NOOS

**Natural-language Orchestration Operating System** — a system that turns chatbot discussions into structured, actionable knowledge for Coding Agents.

```
ChatGPT / Claude / Gemini discussion
  ↓  Shuttle (import)
Raw Handoff in shuttle/inbox/
  ↓  Processor (LLM two-step chain)
Processed Handoff + Wiki nodes + Agent View
  ↓  Progressive Retrieval
Coding Agent reads context → executes → backfills
```

## Modules

### Shuttle (shuttle/)

The requirement intake module. Structures chatbot conversations into Handoff objects that Coding Agents can consume reliably.

Three import paths — pick whichever fits your workflow:

| Path | Command | Best for |
|------|---------|----------|
| Claude Code | `/shuttle-import <text or URL>` | Already in the IDE |
| CLI | `node shuttle/cli/import.mjs <url or file>` | Scripting, automation |
| Browser Extension | Click "Send to Shuttle" on ChatGPT/Claude/Gemini | Lowest friction |

After import, run the Processor to generate structured handoffs, wiki nodes, and agent views:

```bash
cd shuttle/processor
cp config.example.json config.json   # fill in LLM API endpoint + key
node process.mjs                     # full processing
node process.mjs --dry-run           # validate pipeline without LLM
node process.mjs --index-only        # regenerate indexes only
```

See [shuttle/README.md](shuttle/README.md) for details.

### Loom (llm_wiki/)

The knowledge weaving engine. A Tauri v2 desktop app (git submodule) that turns documents into an organized, interlinked knowledge base using LLMs. Based on Karpathy's LLM Wiki pattern.

```bash
cd llm_wiki
npm install
npm run tauri dev    # development
npm run tauri build  # production
npm test             # run tests
```

### ChatGPT Handoff Skill

A reusable prompt you paste into ChatGPT's Custom Instructions. At the end of any design discussion, say "Generate Handoff" and ChatGPT produces a properly formatted raw handoff you can save directly to `shuttle/inbox/`.

See [shuttle/chatgpt-handoff-skill.md](shuttle/chatgpt-handoff-skill.md).

## How it works

1. **Discuss** — Hash out requirements in ChatGPT, Claude, or Gemini
2. **Import** — Send the conversation to Shuttle (extension, CLI, or slash command)
3. **Process** — The Processor extracts decisions, concepts, boundaries, and acceptance criteria into structured Handoff objects and Wiki nodes
4. **Retrieve** — Coding Agents follow the [Retrieval Protocol](shuttle/AGENTS.md) to progressively build context from the Wiki
5. **Execute** — The agent implements the handoff with full context
6. **Backfill** — Results flow back into the knowledge base

## Architecture

```
shuttle/
├── inbox/           Raw handoffs land here
├── handoffs/        Processed handoffs (frontmatter state machine)
├── wiki/            Knowledge nodes (concepts, decisions, open questions)
├── agent-views/     What Coding Agents read first
│   ├── latest.md
│   └── context/     Pre-built context packages per handoff
├── indexes/         Auto-generated knowledge indexes
├── processor/       LLM-powered processing pipeline
├── cli/             CLI import tool
├── extension/       Chrome browser extension
└── AGENTS.md        Retrieval Protocol for Coding Agents
```

## Status

Early development. The core pipeline works end-to-end: import → process → retrieve → execute. Current focus is reducing friction in the import step and expanding wiki coverage.

## Naming

| Name | Meaning | Maps to |
|------|---------|---------|
| **NOOS** | From Greek *nous* (mind, intellect) | The operating system |
| **Loom** | Knowledge weaving engine | `llm_wiki/` |
| **Shuttle** | 梭子 — the thread carrier in a loom | `shuttle/` |

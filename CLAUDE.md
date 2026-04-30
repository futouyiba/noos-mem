# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **noos-mem** repository — a meta-project for **NOOS** (Natural-language Orchestration Operating System), a natural-language-first OS for organizing, orchestrating, and consuming knowledge through LLMs and Agents.

Naming system:
- **NOOS** — the operating system (from Greek *nous*: mind, intellect)
- **Loom** — the knowledge weaving engine (= llm_wiki)
- **Shuttle** — the requirement intake module (梭子, = shuttle/)

Architecture overview:
```
ChatGPT 深度讨论
  ↓
Shuttle: raw handoff → Processor → processed handoff + wiki nodes + agent view
  ↓
Coding Agent: reads agent view → retrieves context from wiki → executes → backfills
```

Contents:

1. **llm_wiki/** — A Tauri v2 desktop application (git submodule from `nashsu/llm_wiki`) that turns documents into an organized, interlinked knowledge base using LLMs. Based on Karpathy's LLM Wiki pattern. This is the core of **Loom**.
2. **shuttle/** — **Shuttle**: the requirement intake module. A Git-first handoff layer that structures ChatGPT discussions into actionable Handoff objects for Coding Agents (Codex/Kiro/Claude Code). See `shuttle/README.md` for usage.
3. **docs/** — Design documents for the Shuttle system and NOOS architecture (historical, uses pre-rename "Agent Inbox" terminology).

## Build & Development Commands

All commands run from `llm_wiki/`:

```bash
# Prerequisites: Node.js 20+, Rust 1.70+
cd llm_wiki
npm install

# Development (launches Tauri + Vite dev server on port 1420)
npm run tauri dev

# Production build
npm run tauri build

# Type checking only
npm run typecheck        # tsc --build --pretty

# Full build (typecheck + vite build)
npm run build
```

### Testing

```bash
# Run all tests (mocks + real-LLM)
npm test

# Run mock tests only (excludes *.real-llm.test.ts)
npm run test:mocks

# Run real-LLM tests only (requires API keys in .env.test.local)
npm run test:llm

# Run a single test file
npx vitest run src/lib/frontmatter.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "pattern"
```

Test config is in `vite.config.ts` under the `test` key (vitest uses vite config). Test env setup loads `.env.test.local` automatically. Real-LLM tests use `--no-file-parallelism` to avoid concurrent API calls.

### Shuttle Processor

```bash
cd shuttle/processor
cp config.example.json config.json   # fill in API endpoint + key
node process.mjs                     # processes inbox/ → handoffs/ + wiki/ + agent-views/
```

## Architecture

### Loom (llm_wiki) — Tauri Desktop App

**Frontend** (React 19 + TypeScript + Vite):
- `src/components/` — UI organized by feature: `chat/`, `graph/`, `editor/`, `sources/`, `search/`, `lint/`, `review/`, `settings/`, `layout/`, `project/`
- `src/stores/` — Zustand stores: `wiki-store.ts` (core wiki state), `chat-store.ts`, `activity-store.ts`, `research-store.ts`, `review-store.ts`, `update-store.ts`
- `src/lib/` — Core logic (largest directory): ingest pipeline, LLM client, search, graph relevance, embedding, wiki operations, deep research
- `src/commands/` — Tauri command wrappers (`fs.ts`)
- Path alias: `@/` maps to `./src/`

**Backend** (Rust, in `src-tauri/`):
- `src/commands/` — Tauri commands: `fs.rs` (file I/O, PDF/DOCX/PPTX/XLSX extraction), `claude_cli.rs` (Claude Code CLI subprocess transport), `extract_images.rs` (multimodal image extraction), `vectorstore.rs` (LanceDB), `project.rs`
- `src/types/` — Shared Rust types (`wiki.rs`)
- `src/clip_server.rs` — Local HTTP server (port 19827) for Chrome extension communication
- `src/panic_guard.rs` — Catches panics at Tauri command boundary

**Key data flow — Ingest Pipeline:**
```
Source document → preprocess_file (Rust, extracts text)
  → Two-step LLM chain: Analysis → Generation
  → Wiki pages created/updated (index.md, log.md, overview.md, entity/concept pages)
  → Optional: auto-embed into LanceDB for vector search
```

**Key data flow — Query Pipeline:**
```
User question → Tokenized search (+ optional vector search via LanceDB)
  → Graph expansion (4-signal relevance model)
  → Budget control (configurable context window)
  → LLM synthesis with citations
```

**State management:** Zustand stores with persistence via Tauri Store plugin. Chats persist to `.llm-wiki/chats/{id}.json`. Project config, settings, review items all survive restarts.

**LLM providers:** Multi-provider support (OpenAI, Anthropic, Google, Ollama, Custom) with provider-specific streaming. Configured in `src/lib/llm-providers.ts` and `src/lib/llm-client.ts`.

### Shuttle — Requirement Intake Module

The Shuttle module is the entry point of the Loom system. It processes raw conversations into structured, actionable handoffs.

**Directory structure:**
```
shuttle/
├── inbox/              # Raw handoff 投递区
├── handoffs/           # Processed handoff（所有状态，frontmatter 管理）
├── wiki/               # 知识沉淀（concepts, decisions, open-questions）
├── agent-views/        # Agent 消费视图
│   ├── latest.md       # 当前最高优先级 ready handoff
│   ├── pending-index.md
│   └── context/        # 预生成的上下文包
├── indexes/            # 自动生成的知识索引（供 Agent 导航）
├── processor/          # Processor 脚本和配置
└── AGENTS.md           # Agent 知识检索协议
```

**Key data flow — Shuttle Pipeline:**
```
Raw handoff (inbox/) → Processor (two-step LLM chain)
  → Processed handoff (handoffs/)
  → Wiki nodes (wiki/concepts/, wiki/decisions/, wiki/open-questions/)
  → Agent view (agent-views/latest.md)
  → Context package (agent-views/context/<slug>-context.md)
  → Knowledge indexes (indexes/)
```

**Progressive Knowledge Retrieval:**
Coding Agents follow the Retrieval Protocol in `shuttle/AGENTS.md` to progressively build context from the wiki. The flow is:
1. Read Handoff + context package (80% of needed context)
2. Follow wikilinks and frontmatter references to deepen understanding
3. Consult indexes for broader system-level context
4. Stop when all referenced nodes are resolved

### docs/ — Historical Design Documents

Design documents using pre-rename "Agent Inbox" terminology:
- `agent-inbox-design.md` — Refined design: Handoff objects with frontmatter-based state machine, wiki node types, agent view generation
- `originalThoughts.md` — Initial brainstorm with 5-layer architecture

## Conventions

- **i18n:** English + Chinese via react-i18next (`src/i18n/`)
- **Styling:** Tailwind CSS v4 + shadcn/ui components (`src/components/ui/`)
- **Wiki files use YAML frontmatter** with `type`, `title`, `sources[]` fields
- **Wikilinks:** `[[wikilink]]` syntax for cross-references (Obsidian-compatible)
- **Graph visualization:** sigma.js + graphology + ForceAtlas2
- **Test naming:** `*.test.ts` for mock tests, `*.real-llm.test.ts` for tests requiring live API keys, `*.property.test.ts` for property-based tests (fast-check), `*.scenarios.test.ts` for scenario tests, `*.integration.test.ts` for integration tests

#!/usr/bin/env node

/**
 * Agent Inbox Processor — MVP
 *
 * Scans inbox/ for raw handoffs, runs a two-step LLM chain
 * (Analysis → Generation), and writes processed handoffs,
 * wiki nodes, and agent views.
 *
 * Usage:
 *   node processor/process.mjs
 *
 * Requires: processor/config.json (copy from config.example.json)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, "..")

// ─── Config ──────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = join(__dirname, "config.json")
  if (!existsSync(configPath)) {
    console.error(
      "[processor] config.json not found. Copy config.example.json to config.json and fill in your API key."
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(configPath, "utf-8"))
}

// ─── Frontmatter parsing (ported from llm_wiki/src/lib/frontmatter.ts) ───

const FM_BLOCK_STRICT_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const FM_BLOCK_ANYWHERE_RE = /\n---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/
const MAX_PREFIX_LINES = 6

function parseFrontmatter(content) {
  // Try strict (top-of-file) match first
  const strict = content.match(FM_BLOCK_STRICT_RE)
  if (strict) {
    return {
      frontmatter: parseYamlSimple(strict[1]),
      body: content.slice(strict[0].length),
      rawBlock: strict[0],
    }
  }

  // Fallback: scan first few lines for a --- block
  const fallback = content.match(FM_BLOCK_ANYWHERE_RE)
  if (fallback && fallback.index !== undefined) {
    const openIdx = fallback.index + 1
    const linesBefore = content.slice(0, openIdx).split("\n").length
    if (linesBefore <= MAX_PREFIX_LINES) {
      const rawBlock = content.slice(openIdx, openIdx + fallback[0].length - 1)
      return {
        frontmatter: parseYamlSimple(fallback[1]),
        body: content.slice(openIdx + rawBlock.length),
        rawBlock,
      }
    }
  }

  return { frontmatter: null, body: content, rawBlock: "" }
}

/**
 * Minimal YAML parser — handles the flat key-value and simple list
 * structures used in handoff frontmatter. No dependency on js-yaml.
 */
function parseYamlSimple(yaml) {
  const result = {}
  const lines = yaml.split("\n")
  let currentKey = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) continue

    // List continuation: "  - value"
    const listItem = line.match(/^\s+-\s+(.+)$/)
    if (listItem && currentKey) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = []
      }
      result[currentKey].push(listItem[1].trim())
      continue
    }

    // Key-value pair
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (kv) {
      const key = kv[1]
      let value = kv[2].trim()
      currentKey = key

      // Inline array: [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        const inner = value.slice(1, -1).trim()
        if (inner === "") {
          result[key] = []
        } else {
          result[key] = inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
        }
        continue
      }

      // Boolean
      if (value === "true") { result[key] = true; continue }
      if (value === "false") { result[key] = false; continue }

      // Quoted string
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        result[key] = value.slice(1, -1)
        continue
      }

      // Empty value — might be followed by list items
      if (value === "") {
        result[key] = ""
        continue
      }

      result[key] = value
    }
  }

  return result
}

// ─── FILE block parsing (ported from llm_wiki/src/lib/ingest.ts) ─────

const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/

/**
 * Allowed output prefixes. Blocks with paths outside these dirs are rejected.
 */
const ALLOWED_PREFIXES = ["handoffs/", "wiki/", "agent-views/"]

function isSafePath(p) {
  if (typeof p !== "string" || p.trim().length === 0) return false
  if (/[\x00-\x1f]/.test(p)) return false
  if (p.startsWith("/") || p.startsWith("\\")) return false
  if (/^[a-zA-Z]:/.test(p)) return false
  const normalized = p.replace(/\\/g, "/")
  if (normalized.split("/").some((seg) => seg === "..")) return false
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function parseFileBlocks(text) {
  const normalized = text.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const blocks = []
  const warnings = []

  let i = 0
  while (i < lines.length) {
    const openerMatch = OPENER_LINE.exec(lines[i])
    if (!openerMatch) { i++; continue }

    const path = openerMatch[1].trim()
    i++

    const contentLines = []
    let fenceMarker = null
    let fenceLen = 0
    let closed = false

    while (i < lines.length) {
      const line = lines[i]

      const fenceMatch = FENCE_LINE.exec(line)
      if (fenceMatch) {
        const run = fenceMatch[1]
        const char = run[0]
        const len = run.length
        if (fenceMarker === null) {
          fenceMarker = char
          fenceLen = len
        } else if (char === fenceMarker && len >= fenceLen) {
          fenceMarker = null
          fenceLen = 0
        }
        contentLines.push(line)
        i++
        continue
      }

      if (fenceMarker === null && CLOSER_LINE.test(line)) {
        closed = true
        i++
        break
      }

      contentLines.push(line)
      i++
    }

    if (!closed) {
      const label = path || "(unnamed)"
      warnings.push(`FILE block "${label}" not closed — likely truncation. Block dropped.`)
      continue
    }

    if (!path) {
      warnings.push("FILE block with empty path skipped.")
      continue
    }

    if (!isSafePath(path)) {
      warnings.push(`FILE block with unsafe path "${path}" rejected.`)
      continue
    }

    blocks.push({ path, content: contentLines.join("\n") })
  }

  return { blocks, warnings }
}

// ─── LLM Client (fetch-based, OpenAI-compatible) ────────────────────

async function callLLM(config, systemPrompt, userPrompt) {
  const { endpoint, apiKey, model, maxTokens = 4096, temperature = 0.3 } = config.llm

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: false,
  }

  const headers = {
    "Content-Type": "application/json",
  }

  // Support both OpenAI and Anthropic style auth
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
    headers["x-api-key"] = apiKey
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`LLM API error ${response.status}: ${text}`)
  }

  const data = await response.json()

  // OpenAI format
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content
  }

  // Anthropic format
  if (data.content?.[0]?.text) {
    return data.content[0].text
  }

  throw new Error(`Unexpected LLM response format: ${JSON.stringify(data).slice(0, 200)}`)
}

// ─── ID generation ──────────────────────────────────────────────────

function shortHash(input) {
  return createHash("sha256").update(input).digest("hex").slice(0, 4)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function todayCompact() {
  return today().replace(/-/g, "")
}

// ─── Prompt loading ─────────────────────────────────────────────────

function loadPrompt(name) {
  const promptPath = join(__dirname, "prompts", `${name}.md`)
  return readFileSync(promptPath, "utf-8")
}

function loadRules() {
  const rulesDir = join(__dirname, "rules")
  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"))
  return files.map((f) => {
    const content = readFileSync(join(rulesDir, f), "utf-8")
    return `## ${f}\n\n${content}`
  }).join("\n\n---\n\n")
}

// ─── Knowledge base scanning ────────────────────────────────────────

function scanExistingKnowledge() {
  const knowledge = { concepts: [], decisions: [], openQuestions: [], handoffs: [] }

  const dirs = [
    { dir: join(ROOT, "wiki", "concepts"), key: "concepts" },
    { dir: join(ROOT, "wiki", "decisions"), key: "decisions" },
    { dir: join(ROOT, "wiki", "open-questions"), key: "openQuestions" },
    { dir: join(ROOT, "handoffs"), key: "handoffs" },
  ]

  for (const { dir, key } of dirs) {
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"))
    for (const file of files) {
      const content = readFileSync(join(dir, file), "utf-8")
      const { frontmatter } = parseFrontmatter(content)
      knowledge[key].push({
        file,
        title: frontmatter?.title || file.replace(/\.md$/, ""),
        status: frontmatter?.status || "unknown",
        id: frontmatter?.id || "",
      })
    }
  }

  return knowledge
}

function formatKnowledgeSummary(knowledge) {
  const sections = []

  if (knowledge.concepts.length > 0) {
    sections.push("### Existing Concepts\n" +
      knowledge.concepts.map((c) => `- ${c.title} (${c.file})`).join("\n"))
  }

  if (knowledge.decisions.length > 0) {
    sections.push("### Existing Decisions\n" +
      knowledge.decisions.map((d) => `- ${d.title} (${d.file})`).join("\n"))
  }

  if (knowledge.openQuestions.length > 0) {
    sections.push("### Existing Open Questions\n" +
      knowledge.openQuestions.map((q) => `- ${q.title} (${q.file})`).join("\n"))
  }

  if (knowledge.handoffs.length > 0) {
    sections.push("### Existing Handoffs\n" +
      knowledge.handoffs.map((h) => `- [${h.status}] ${h.title} (${h.file})`).join("\n"))
  }

  if (sections.length === 0) {
    return "No existing knowledge base entries."
  }

  return sections.join("\n\n")
}

// ─── Inbox scanning ─────────────────────────────────────────────────

function scanInbox() {
  const inboxDir = join(ROOT, "inbox")
  if (!existsSync(inboxDir)) return []

  const files = readdirSync(inboxDir).filter((f) => f.endsWith(".raw.md"))
  const rawHandoffs = []

  for (const file of files) {
    const content = readFileSync(join(inboxDir, file), "utf-8")
    const { frontmatter, body } = parseFrontmatter(content)

    if (frontmatter?.status !== "raw" && frontmatter?.type !== "raw_handoff") {
      continue
    }

    rawHandoffs.push({ file, content, frontmatter, body })
  }

  return rawHandoffs
}

// ─── File writing ───────────────────────────────────────────────────

function writeOutputFile(relativePath, content) {
  const fullPath = join(ROOT, relativePath)
  const dir = dirname(fullPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(fullPath, content, "utf-8")
  console.log(`  [write] ${relativePath}`)
}

// ─── Pending index update ───────────────────────────────────────────

function updatePendingIndex() {
  const handoffsDir = join(ROOT, "handoffs")
  if (!existsSync(handoffsDir)) return

  const files = readdirSync(handoffsDir).filter((f) => f.endsWith(".md"))
  const entries = []

  for (const file of files) {
    const content = readFileSync(join(handoffsDir, file), "utf-8")
    const { frontmatter } = parseFrontmatter(content)
    if (!frontmatter) continue
    if (frontmatter.status === "archived" || frontmatter.status === "discarded") continue

    entries.push({
      status: frontmatter.status || "unknown",
      id: frontmatter.id || "",
      title: frontmatter.title || file,
      created: frontmatter.created_at || "",
      file: `handoffs/${file}`,
    })
  }

  // Sort: ready first, then by date
  const statusOrder = { ready: 0, "in-progress": 1, blocked: 2, implemented: 3 }
  entries.sort((a, b) => {
    const oa = statusOrder[a.status] ?? 99
    const ob = statusOrder[b.status] ?? 99
    if (oa !== ob) return oa - ob
    return a.created.localeCompare(b.created)
  })

  let md = `# Agent Views — Pending Index\n\n`
  md += `> 自动生成，请勿手动编辑。由 \`processor/process.mjs\` 维护。\n\n`
  md += `## 所有非 archived handoff\n\n`

  if (entries.length === 0) {
    md += `| 状态 | ID | 标题 | 创建日期 | 文件 |\n`
    md += `|------|-----|------|---------|------|\n\n`
    md += `*暂无 handoff。*\n`
  } else {
    md += `| 状态 | ID | 标题 | 创建日期 | 文件 |\n`
    md += `|------|-----|------|---------|------|\n`
    for (const e of entries) {
      md += `| ${e.status} | ${e.id} | ${e.title} | ${e.created} | ${e.file} |\n`
    }
  }

  writeOutputFile("agent-views/pending-index.md", md)
}

// ─── Update latest.md with highest-priority ready handoff ───────────

function updateLatestView() {
  const handoffsDir = join(ROOT, "handoffs")
  if (!existsSync(handoffsDir)) return

  const files = readdirSync(handoffsDir).filter((f) => f.endsWith(".md"))
  let bestReady = null

  for (const file of files) {
    const content = readFileSync(join(handoffsDir, file), "utf-8")
    const { frontmatter } = parseFrontmatter(content)
    if (!frontmatter || frontmatter.status !== "ready") continue

    if (!bestReady || (frontmatter.created_at || "") < (bestReady.frontmatter.created_at || "")) {
      bestReady = { file, content, frontmatter }
    }
  }

  if (!bestReady) {
    // Check if latest.md was just generated by the LLM (has real content)
    const latestPath = join(ROOT, "agent-views", "latest.md")
    if (existsSync(latestPath)) {
      const existing = readFileSync(latestPath, "utf-8")
      if (existing.includes("## 目标") && existing.includes("## 验收标准")) {
        // LLM already generated a good agent view, keep it
        return
      }
    }

    writeOutputFile("agent-views/latest.md",
      "# Agent View\n\n> 暂无 ready handoff。运行 `node processor/process.mjs` 处理 inbox/ 中的 raw handoff。\n")
    return
  }

  // If there's a ready handoff but no LLM-generated agent view, generate a basic one
  // (The LLM generation step should have already created latest.md)
}

// ─── Mark raw handoff as processed ──────────────────────────────────

function markRawAsProcessed(rawFile) {
  const rawPath = join(ROOT, "inbox", rawFile)
  const content = readFileSync(rawPath, "utf-8")

  // Replace status: raw with status: processed in frontmatter
  const updated = content.replace(
    /^(status:\s*)raw\s*$/m,
    "$1processed"
  )

  writeFileSync(rawPath, updated, "utf-8")
  console.log(`  [update] inbox/${rawFile} → status: processed`)
}

// ─── Main processing pipeline ───────────────────────────────────────

async function processRawHandoff(raw, config, knowledge) {
  const { file, content, frontmatter } = raw
  const date = today()
  const dateCompact = todayCompact()
  const slug = frontmatter?.id?.replace(/^raw-\d+-/, "")
    || file.replace(/\.raw\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}_/, "")
  const hash = shortHash(`${date}-${slug}-${Date.now()}`)
  const handoffId = `handoff-${dateCompact}-${slug}-${hash}`

  console.log(`\n[processor] Processing: ${file}`)
  console.log(`  Handoff ID: ${handoffId}`)

  // ── Step 1: Analysis ──
  console.log("  Step 1: Analysis...")

  const analysisPrompt = loadPrompt("analysis")
  const rules = loadRules()
  const knowledgeSummary = formatKnowledgeSummary(knowledge)

  const analysisSystemPrompt = `${analysisPrompt}\n\n---\n\n${rules}`
  const analysisUserPrompt = [
    `## Raw Handoff\n\nFilename: ${file}\n\n${content}`,
    `## Existing Knowledge Base\n\n${knowledgeSummary}`,
    `## Current Date\n\n${date}`,
  ].join("\n\n---\n\n")

  const analysisResult = await callLLM(config, analysisSystemPrompt, analysisUserPrompt)
  console.log("  Step 1 complete.")

  // Parse analysis JSON — handle markdown code fences
  let analysis
  try {
    // Strip markdown code fences if present
    let jsonStr = analysisResult.trim()
    const fenceMatch = jsonStr.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/m)
    if (fenceMatch) {
      jsonStr = fenceMatch[1]
    }
    analysis = JSON.parse(jsonStr)
  } catch (e) {
    console.error("  [error] Failed to parse analysis JSON:", e.message)
    console.error("  Raw analysis output (first 500 chars):", analysisResult.slice(0, 500))
    return null
  }

  console.log(`  Analysis: recommendation=${analysis.recommendation}, slug=${analysis.slug}`)
  console.log(`  Concepts: ${analysis.concepts?.length || 0}, Decisions: ${analysis.decisions?.length || 0}, Open Questions: ${analysis.open_questions?.length || 0}`)

  // ── Step 2: Generation ──
  console.log("  Step 2: Generation...")

  const generationPrompt = loadPrompt("generation")
  const generationSystemPrompt = generationPrompt
  const generationUserPrompt = [
    `## Analysis Result\n\n\`\`\`json\n${JSON.stringify(analysis, null, 2)}\n\`\`\``,
    `## Original Raw Handoff\n\n${content}`,
    `## Metadata\n\n- Current date: ${date}\n- Handoff ID: ${handoffId}\n- Raw filename: ${file}\n- Slug: ${analysis.slug || slug}`,
  ].join("\n\n---\n\n")

  const generationResult = await callLLM(config, generationSystemPrompt, generationUserPrompt)
  console.log("  Step 2 complete.")

  // ── Parse and write FILE blocks ──
  const { blocks, warnings } = parseFileBlocks(generationResult)

  if (warnings.length > 0) {
    console.log("  Warnings:")
    for (const w of warnings) {
      console.log(`    - ${w}`)
    }
  }

  if (blocks.length === 0) {
    console.error("  [error] No FILE blocks found in generation output.")
    console.error("  Raw generation output (first 500 chars):", generationResult.slice(0, 500))
    return null
  }

  console.log(`  Writing ${blocks.length} files...`)
  for (const block of blocks) {
    writeOutputFile(block.path, block.content)
  }

  // Mark raw handoff as processed
  markRawAsProcessed(file)

  return { handoffId, analysis, blocksWritten: blocks.length }
}

// ─── Entry point ────────────────────────────────────────────────────

async function main() {
  console.log("=== Agent Inbox Processor ===\n")

  const config = loadConfig()
  console.log(`LLM: ${config.llm.model} @ ${config.llm.endpoint}`)

  // Scan inbox
  const rawHandoffs = scanInbox()
  if (rawHandoffs.length === 0) {
    console.log("\nNo raw handoffs found in inbox/. Nothing to process.")
    return
  }
  console.log(`\nFound ${rawHandoffs.length} raw handoff(s) to process.`)

  // Scan existing knowledge
  const knowledge = scanExistingKnowledge()
  console.log(`Knowledge base: ${knowledge.concepts.length} concepts, ${knowledge.decisions.length} decisions, ${knowledge.openQuestions.length} open questions, ${knowledge.handoffs.length} handoffs`)

  // Process each raw handoff
  const results = []
  for (const raw of rawHandoffs) {
    const result = await processRawHandoff(raw, config, knowledge)
    if (result) {
      results.push(result)
    }
  }

  // Update indexes
  console.log("\nUpdating indexes...")
  updatePendingIndex()
  updateLatestView()

  // Summary
  console.log("\n=== Processing Complete ===")
  console.log(`Processed: ${results.length}/${rawHandoffs.length}`)
  for (const r of results) {
    console.log(`  - ${r.handoffId}: ${r.blocksWritten} files written, recommendation: ${r.analysis.recommendation}`)
  }

  if (results.length < rawHandoffs.length) {
    console.log(`\n${rawHandoffs.length - results.length} handoff(s) failed. Check errors above.`)
  }
}

main().catch((err) => {
  console.error("\n[fatal]", err)
  process.exit(1)
})

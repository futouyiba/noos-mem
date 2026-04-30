#!/usr/bin/env node

/**
 * Shuttle CLI Import
 *
 * Import conversations from chatbot share links, local files, or stdin
 * into shuttle/inbox/ as raw handoffs.
 *
 * Usage:
 *   node shuttle/cli/import.mjs <url-or-file>
 *   node shuttle/cli/import.mjs --process <url-or-file>
 *   pbpaste | node shuttle/cli/import.mjs -
 *   node shuttle/cli/import.mjs --help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { conversationToRawHandoff } from "../lib/conversation-to-handoff.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, "..")

// ─── Argument parsing ──────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: null, process: false, help: false }
  for (const arg of argv.slice(2)) {
    if (arg === "--help" || arg === "-h") args.help = true
    else if (arg === "--process" || arg === "-p") args.process = true
    else if (!args.input) args.input = arg
  }
  return args
}

function printHelp() {
  console.log(`
Shuttle Import — bring chatbot conversations into shuttle/inbox/

Usage:
  node shuttle/cli/import.mjs <url>              Import from share link
  node shuttle/cli/import.mjs <file.json>        Import from exported conversation
  node shuttle/cli/import.mjs <file.md>          Import from markdown file
  pbpaste | node shuttle/cli/import.mjs -        Import from stdin
  node shuttle/cli/import.mjs --process <url>    Import and run Processor

Supported share links:
  https://chatgpt.com/share/...
  https://claude.ai/share/...
  https://g.co/gemini/share/...

Options:
  --process, -p    Run shuttle/processor/process.mjs after import
  --help, -h       Show this help
`)
}

// ─── URL detection ─────────────────────────────────────────────────

function detectSource(url) {
  if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "chatgpt"
  if (/claude\.ai/.test(url)) return "claude"
  if (/gemini\.google\.com|g\.co\/gemini/.test(url)) return "gemini"
  return null
}

function isUrl(input) {
  return /^https?:\/\//.test(input)
}

// ─── Fetch and parse share links ───────────────────────────────────

async function fetchShareLink(url) {
  const source = detectSource(url)
  if (!source) {
    console.error(`[import] Unrecognized URL: ${url}`)
    console.error("  Supported: chatgpt.com, claude.ai, gemini.google.com")
    process.exit(1)
  }

  console.log(`[import] Fetching ${source} share link...`)

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()
  return parseSharePage(html, source, url)
}

function parseSharePage(html, source, url) {
  let title = ""
  let messages = []

  // Try to extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) {
    title = titleMatch[1].trim()
      .replace(/ \| ChatGPT$/, "")
      .replace(/ - Claude$/, "")
      .replace(/ - Google Gemini$/, "")
  }

  if (source === "chatgpt") {
    // ChatGPT share pages embed conversation data in a <script> tag
    // Look for the Next.js data payload
    const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
    if (scriptMatch) {
      try {
        const data = JSON.parse(scriptMatch[1])
        const mapping = data?.props?.pageProps?.serverResponse?.data?.mapping
        if (mapping) {
          const nodes = Object.values(mapping)
            .filter((n) => n.message && n.message.content?.parts)
            .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0))

          messages = nodes.map((n) => ({
            role: n.message.author?.role === "assistant" ? "assistant" : "user",
            content: n.message.content.parts.join("\n"),
          })).filter((m) => m.content.trim())

          if (!title && messages.length > 0) {
            title = messages[0].content.slice(0, 80)
          }
        }
      } catch {
        // Fall through to text extraction
      }
    }
  }

  // Fallback: extract visible text from HTML
  if (messages.length === 0) {
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    if (textContent.length > 100) {
      messages = [{ role: "user", content: textContent }]
    }
  }

  if (!title) title = `${source} conversation`

  return { title, source, url, messages }
}

// ─── File parsing ──────────────────────────────────────────────────

function parseLocalFile(filePath) {
  const content = readFileSync(filePath, "utf-8")
  const ext = filePath.split(".").pop().toLowerCase()

  if (ext === "json") {
    return parseJsonConversation(content, filePath)
  }

  // Treat as raw text/markdown
  const title = filePath.split("/").pop().replace(/\.\w+$/, "")
  return {
    title,
    source: "other",
    url: "",
    messages: [{ role: "user", content }],
  }
}

function parseJsonConversation(jsonStr, filePath) {
  const data = JSON.parse(jsonStr)

  // ChatGPT export format: array of conversations
  if (Array.isArray(data) && data[0]?.mapping) {
    const conv = data[0]
    const mapping = conv.mapping
    const nodes = Object.values(mapping)
      .filter((n) => n.message && n.message.content?.parts)
      .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0))

    return {
      title: conv.title || "ChatGPT export",
      source: "chatgpt",
      url: "",
      messages: nodes.map((n) => ({
        role: n.message.author?.role === "assistant" ? "assistant" : "user",
        content: n.message.content.parts.join("\n"),
      })).filter((m) => m.content.trim()),
    }
  }

  // Generic: array of {role, content}
  if (Array.isArray(data) && data[0]?.role) {
    return {
      title: filePath.split("/").pop().replace(/\.json$/, ""),
      source: "other",
      url: "",
      messages: data,
    }
  }

  // Single object with messages array
  if (data.messages && Array.isArray(data.messages)) {
    return {
      title: data.title || filePath.split("/").pop().replace(/\.json$/, ""),
      source: data.source || "other",
      url: data.url || "",
      messages: data.messages,
    }
  }

  throw new Error(`Unrecognized JSON format in ${filePath}`)
}

// ─── Stdin reading ─────────────────────────────────────────────────

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf-8")
}

// ─── Write to inbox ────────────────────────────────────────────────

function writeToInbox(filename, content) {
  const inboxDir = join(ROOT, "inbox")
  if (!existsSync(inboxDir)) {
    mkdirSync(inboxDir, { recursive: true })
  }

  const filePath = join(inboxDir, filename)

  // Avoid overwriting
  if (existsSync(filePath)) {
    const base = filename.replace(/\.raw\.md$/, "")
    let counter = 2
    let newName
    do {
      newName = `${base}-${counter}.raw.md`
      counter++
    } while (existsSync(join(inboxDir, newName)))
    writeFileSync(join(inboxDir, newName), content, "utf-8")
    return newName
  }

  writeFileSync(filePath, content, "utf-8")
  return filename
}

// ─── Run processor ─────────────────────────────────────────────────

async function runProcessor() {
  const { execSync } = await import("node:child_process")
  console.log("\n[import] Running Shuttle Processor...")
  try {
    execSync("node processor/process.mjs", { cwd: join(ROOT, "processor"), stdio: "inherit" })
  } catch (e) {
    console.error("[import] Processor failed:", e.message)
  }
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv)

  if (args.help || !args.input) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  let conversation

  if (args.input === "-") {
    // Read from stdin
    console.log("[import] Reading from stdin...")
    const text = await readStdin()
    if (!text.trim()) {
      console.error("[import] Empty stdin. Pipe content or use a URL/file path.")
      process.exit(1)
    }
    conversation = {
      title: text.split("\n")[0].slice(0, 80).trim() || "stdin import",
      source: "other",
      url: "",
      messages: [{ role: "user", content: text }],
    }
  } else if (isUrl(args.input)) {
    // Fetch share link
    conversation = await fetchShareLink(args.input)
  } else if (existsSync(args.input)) {
    // Parse local file
    console.log(`[import] Reading file: ${args.input}`)
    conversation = parseLocalFile(args.input)
  } else {
    console.error(`[import] Not a URL and file not found: ${args.input}`)
    process.exit(1)
  }

  console.log(`[import] Title: ${conversation.title}`)
  console.log(`[import] Source: ${conversation.source}`)
  console.log(`[import] Messages: ${conversation.messages.length}`)

  // Convert to raw handoff
  const { filename, content } = conversationToRawHandoff(conversation)
  const writtenAs = writeToInbox(filename, content)

  console.log(`[import] Written to: shuttle/inbox/${writtenAs}`)

  if (args.process) {
    await runProcessor()
  } else {
    console.log(`\nTo process: node shuttle/processor/process.mjs`)
  }
}

main().catch((err) => {
  console.error("[import] Fatal:", err.message)
  process.exit(1)
})

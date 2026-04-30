/**
 * Conversation → Raw Handoff converter
 *
 * Shared by CLI import and browser extension intake paths.
 * Takes structured conversation data and produces a raw handoff
 * markdown file ready for shuttle/inbox/.
 */

/**
 * @param {Object} opts
 * @param {string} opts.title - Conversation title
 * @param {string} opts.source - "chatgpt" | "claude" | "gemini" | "other"
 * @param {string} [opts.url] - Original conversation URL
 * @param {Array<{role: string, content: string}>} opts.messages - Conversation messages
 * @param {string} [opts.selectedText] - User-selected subset of conversation
 * @param {string} [opts.date] - Override date (YYYY-MM-DD), defaults to today
 * @returns {{ filename: string, content: string }}
 */
export function conversationToRawHandoff({ title, source, url, messages, selectedText, date }) {
  const d = date || new Date().toISOString().slice(0, 10)
  const dateCompact = d.replace(/-/g, "")
  const slug = generateSlug(title)
  const id = `raw-${dateCompact}-${slug}`
  const filename = `${d}_${slug}.raw.md`

  const conversationMd = selectedText
    ? selectedText
    : formatMessages(messages)

  const content = `---
type: raw_handoff
id: ${id}
title: "${escapeYaml(title)}"
source: ${source}
status: raw
created_at: ${d}
url: "${url || ""}"
tags: [${source}]
---

# Raw Handoff: ${title}

## Source Context

Imported from ${sourceLabel(source)}${url ? ` — ${url}` : ""}.

## Discussion Content

${conversationMd}
`

  return { filename, content }
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "untitled"
}

function escapeYaml(str) {
  return str.replace(/"/g, '\\"')
}

function sourceLabel(source) {
  const labels = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini" }
  return labels[source] || source
}

function formatMessages(messages) {
  if (!messages || messages.length === 0) return "*No messages provided.*"

  return messages.map((m) => {
    const role = m.role === "assistant" ? "**Assistant**" : "**User**"
    return `${role}:\n\n${m.content}`
  }).join("\n\n---\n\n")
}

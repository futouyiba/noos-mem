// Shuttle — Background service worker
// Handles context menu and delivery to Loom clip_server or GitHub

const CLIP_SERVER = "http://localhost:19827"

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "shuttle-send",
    title: "Send to Shuttle",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
    ],
  })

  chrome.contextMenus.create({
    id: "shuttle-send-selection",
    title: "Send selection to Shuttle",
    contexts: ["selection"],
    documentUrlPatterns: [
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://gemini.google.com/*",
    ],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "shuttle-send" || info.menuItemId === "shuttle-send-selection") {
    const selectedText = info.menuItemId === "shuttle-send-selection" ? info.selectionText : null
    await extractAndSend(tab.id, selectedText)
  }
})

async function extractAndSend(tabId, selectedText) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "extractConversation" })

    if (!response?.ok) {
      notify("Shuttle", `Extraction failed: ${response?.error || "unknown error"}`)
      return
    }

    const data = response.data
    if (selectedText) {
      data.selectedText = selectedText
    }

    // Try local Loom clip_server first
    const delivered = await deliverLocal(data)
    if (!delivered) {
      // Fallback: try GitHub API
      const ghDelivered = await deliverGitHub(data)
      if (!ghDelivered) {
        notify("Shuttle", "Delivery failed. Is Loom running? Check extension settings for GitHub token.")
      }
    }
  } catch (e) {
    notify("Shuttle", `Error: ${e.message}`)
  }
}

async function deliverLocal(data) {
  try {
    // Check if clip_server is running
    const status = await fetch(`${CLIP_SERVER}/status`, { signal: AbortSignal.timeout(2000) })
    if (!status.ok) return false

    // Get current project path
    const projResp = await fetch(`${CLIP_SERVER}/project`)
    const projData = await projResp.json()
    const projectPath = projData.path

    if (!projectPath) {
      notify("Shuttle", "No project open in Loom. Open a project first.")
      return false
    }

    // Build the content for shuttle/inbox/
    const date = new Date().toISOString().slice(0, 10)
    const slug = data.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .slice(0, 60) || "untitled"

    const messagesText = data.selectedText || data.messages
      .map((m) => `**${m.role === "assistant" ? "Assistant" : "User"}**:\n\n${m.content}`)
      .join("\n\n---\n\n")

    const content = [
      "---",
      "type: raw_handoff",
      `id: raw-${date.replace(/-/g, "")}-${slug}`,
      `title: "${data.title.replace(/"/g, '\\"')}"`,
      `source: ${data.source}`,
      "status: raw",
      `created_at: ${date}`,
      `url: "${data.url}"`,
      `tags: [${data.source}]`,
      "---",
      "",
      `# Raw Handoff: ${data.title}`,
      "",
      "## Source Context",
      "",
      `Imported from ${data.source} via Shuttle browser extension — ${data.url}`,
      "",
      "## Discussion Content",
      "",
      messagesText,
      "",
    ].join("\n")

    // Post to clip_server's /clip endpoint with shuttle type marker
    const resp = await fetch(`${CLIP_SERVER}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        url: data.url,
        content,
        projectPath,
        type: "shuttle",
      }),
    })

    const result = await resp.json()
    if (result.ok) {
      notify("Shuttle", `Sent: ${data.title}\nRun processor to generate handoff.`)
      return true
    }

    return false
  } catch {
    return false
  }
}

async function deliverGitHub(data) {
  try {
    const settings = await chrome.storage.sync.get(["githubToken", "githubRepo", "githubBranch"])
    const { githubToken, githubRepo, githubBranch } = settings

    if (!githubToken || !githubRepo) return false

    const date = new Date().toISOString().slice(0, 10)
    const slug = data.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .slice(0, 60) || "untitled"

    const filename = `${date}_${slug}.raw.md`
    const path = `shuttle/inbox/${filename}`

    const messagesText = data.selectedText || data.messages
      .map((m) => `**${m.role === "assistant" ? "Assistant" : "User"}**:\n\n${m.content}`)
      .join("\n\n---\n\n")

    const content = [
      "---",
      "type: raw_handoff",
      `id: raw-${date.replace(/-/g, "")}-${slug}`,
      `title: "${data.title.replace(/"/g, '\\"')}"`,
      `source: ${data.source}`,
      "status: raw",
      `created_at: ${date}`,
      `url: "${data.url}"`,
      `tags: [${data.source}]`,
      "---",
      "",
      `# Raw Handoff: ${data.title}`,
      "",
      "## Source Context",
      "",
      `Imported from ${data.source} via Shuttle browser extension — ${data.url}`,
      "",
      "## Discussion Content",
      "",
      messagesText,
      "",
    ].join("\n")

    const resp = await fetch(`https://api.github.com/repos/${githubRepo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `shuttle: import ${data.source} conversation — ${data.title}`,
        content: btoa(unescape(encodeURIComponent(content))),
        branch: githubBranch || "main",
      }),
    })

    if (resp.ok) {
      notify("Shuttle", `Pushed to GitHub: ${path}`)
      return true
    }

    return false
  } catch {
    return false
  }
}

function notify(title, message) {
  chrome.notifications?.create({
    type: "basic",
    iconUrl: "icons/shuttle-48.png",
    title,
    message,
  })
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "sendToShuttle") {
    extractAndSend(msg.tabId, msg.selectedText).then(() => sendResponse({ ok: true }))
    return true
  }
})

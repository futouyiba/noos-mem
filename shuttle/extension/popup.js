const statusEl = document.getElementById("status")
const previewSection = document.getElementById("preview-section")
const previewTitle = document.getElementById("preview-title")
const previewSource = document.getElementById("preview-source")
const previewCount = document.getElementById("preview-count")
const sendBtn = document.getElementById("send-btn")

let conversationData = null
let activeTabId = null

async function init() {
  // Load settings
  const settings = await chrome.storage.sync.get(["githubToken", "githubRepo", "githubBranch"])
  if (settings.githubToken) document.getElementById("gh-token").value = settings.githubToken
  if (settings.githubRepo) document.getElementById("gh-repo").value = settings.githubRepo
  if (settings.githubBranch) document.getElementById("gh-branch").value = settings.githubBranch

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) {
    statusEl.textContent = "No active tab"
    statusEl.className = "status error"
    return
  }

  activeTabId = tab.id
  const url = tab.url || ""

  // Check if we're on a supported page
  const supported = /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com/.test(url)
  if (!supported) {
    statusEl.textContent = "Not on a supported chatbot page. Open ChatGPT, Claude, or Gemini."
    statusEl.className = "status error"
    return
  }

  // Extract conversation
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractConversation" })

    if (!response?.ok) {
      statusEl.textContent = `Could not extract: ${response?.error || "content script not loaded"}`
      statusEl.className = "status error"
      return
    }

    conversationData = response.data

    if (conversationData.messages.length === 0) {
      statusEl.textContent = "No messages found. Start a conversation first."
      statusEl.className = "status error"
      return
    }

    // Show preview
    statusEl.textContent = "Ready to send"
    statusEl.className = "status ok"
    previewSection.style.display = "block"
    previewTitle.textContent = conversationData.title
    previewSource.textContent = conversationData.source
    previewCount.textContent = `${conversationData.messages.length} messages`
    sendBtn.disabled = false
  } catch (e) {
    statusEl.textContent = "Content script not loaded. Try refreshing the page."
    statusEl.className = "status error"
  }
}

sendBtn.addEventListener("click", async () => {
  if (!conversationData || !activeTabId) return

  sendBtn.disabled = true
  sendBtn.textContent = "Sending..."
  statusEl.textContent = "Delivering..."
  statusEl.className = "status"

  try {
    await chrome.runtime.sendMessage({
      action: "sendToShuttle",
      tabId: activeTabId,
      data: conversationData,
    })
    statusEl.textContent = "Sent! Run the Shuttle Processor to generate the handoff."
    statusEl.className = "status ok"
    sendBtn.textContent = "Sent"
  } catch (e) {
    statusEl.textContent = `Failed: ${e.message}`
    statusEl.className = "status error"
    sendBtn.disabled = false
    sendBtn.textContent = "Send to Shuttle"
  }
})

document.getElementById("save-settings").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    githubToken: document.getElementById("gh-token").value,
    githubRepo: document.getElementById("gh-repo").value,
    githubBranch: document.getElementById("gh-branch").value || "main",
  })
  const btn = document.getElementById("save-settings")
  btn.textContent = "Saved"
  setTimeout(() => { btn.textContent = "Save" }, 1500)
})

init()

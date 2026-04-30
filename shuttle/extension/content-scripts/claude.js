// Shuttle — Claude content script
// Extracts conversation messages from claude.ai pages

(() => {
  function extractConversation() {
    const messages = []

    // Strategy 1: data-testid based
    const msgEls = document.querySelectorAll('[data-testid="chat-message-content"], [data-testid="user-message"], [data-testid="ai-message"]')
    if (msgEls.length > 0) {
      for (const el of msgEls) {
        const isAssistant = el.closest('[data-testid="ai-message"]') ||
          el.classList.contains('font-claude-message') ||
          el.closest('[data-is-streaming]') !== null
        messages.push({
          role: isAssistant ? "assistant" : "user",
          content: el.innerText.trim(),
        })
      }
    }

    // Strategy 2: role-based containers
    if (messages.length === 0) {
      const humanTurns = document.querySelectorAll('[class*="human"], [class*="Human"]')
      const assistantTurns = document.querySelectorAll('[class*="claude"], [class*="Claude"], [class*="assistant"]')

      const allTurns = []
      for (const el of humanTurns) {
        const rect = el.getBoundingClientRect()
        allTurns.push({ role: "user", content: el.innerText.trim(), top: rect.top })
      }
      for (const el of assistantTurns) {
        const rect = el.getBoundingClientRect()
        allTurns.push({ role: "assistant", content: el.innerText.trim(), top: rect.top })
      }

      allTurns.sort((a, b) => a.top - b.top)
      for (const turn of allTurns) {
        if (turn.content.length > 0) {
          messages.push({ role: turn.role, content: turn.content })
        }
      }
    }

    // Strategy 3: generic prose blocks
    if (messages.length === 0) {
      const blocks = document.querySelectorAll('.prose, .whitespace-pre-wrap, [class*="message"]')
      let isUser = true
      for (const block of blocks) {
        const text = block.innerText.trim()
        if (text.length > 20) {
          messages.push({ role: isUser ? "user" : "assistant", content: text })
          isUser = !isUser
        }
      }
    }

    const title = document.title.replace(/ - Claude$/, "").trim() || "Claude conversation"

    return {
      title,
      source: "claude",
      url: window.location.href,
      messages: messages.filter((m) => m.content.length > 0),
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "extractConversation") {
      try {
        const data = extractConversation()
        sendResponse({ ok: true, data })
      } catch (e) {
        sendResponse({ ok: false, error: e.message })
      }
    }
    return true
  })
})()

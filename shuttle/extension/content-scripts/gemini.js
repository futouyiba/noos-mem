// Shuttle — Gemini content script
// Extracts conversation messages from gemini.google.com pages

(() => {
  function extractConversation() {
    const messages = []

    // Strategy 1: custom elements
    const userQueries = document.querySelectorAll('user-query, [class*="user-query"]')
    const modelResponses = document.querySelectorAll('model-response, [class*="model-response"]')

    if (userQueries.length > 0 || modelResponses.length > 0) {
      const allTurns = []
      for (const el of userQueries) {
        const rect = el.getBoundingClientRect()
        allTurns.push({ role: "user", content: el.innerText.trim(), top: rect.top })
      }
      for (const el of modelResponses) {
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

    // Strategy 2: message-content containers
    if (messages.length === 0) {
      const containers = document.querySelectorAll('[class*="message-content"], [class*="response-container"], [class*="query-content"]')
      let isUser = true
      for (const el of containers) {
        const text = el.innerText.trim()
        if (text.length > 20) {
          messages.push({ role: isUser ? "user" : "assistant", content: text })
          isUser = !isUser
        }
      }
    }

    const title = document.title.replace(/ - Google Gemini$/, "").trim() || "Gemini conversation"

    return {
      title,
      source: "gemini",
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

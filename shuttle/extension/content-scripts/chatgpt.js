// Shuttle — ChatGPT content script
// Extracts conversation messages from chatgpt.com pages

(() => {
  function extractConversation() {
    const messages = []

    // Strategy 1: data-testid conversation turns
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]')
    if (turns.length > 0) {
      for (const turn of turns) {
        const isAssistant = turn.querySelector('[data-message-author-role="assistant"]')
        const role = isAssistant ? "assistant" : "user"
        const contentEl = turn.querySelector('.markdown, .whitespace-pre-wrap, [data-message-content]')
        if (contentEl) {
          messages.push({ role, content: contentEl.innerText.trim() })
        }
      }
    }

    // Strategy 2: article-based layout
    if (messages.length === 0) {
      const articles = document.querySelectorAll('article[data-testid]')
      for (const article of articles) {
        const role = article.querySelector('[data-message-author-role="assistant"]') ? "assistant" : "user"
        const prose = article.querySelector('.prose, .markdown, .whitespace-pre-wrap')
        if (prose) {
          messages.push({ role, content: prose.innerText.trim() })
        }
      }
    }

    // Strategy 3: generic group-based fallback
    if (messages.length === 0) {
      const groups = document.querySelectorAll('.group\\/conversation-turn, [class*="group"]')
      let isUser = true
      for (const group of groups) {
        const text = group.innerText.trim()
        if (text.length > 10) {
          messages.push({ role: isUser ? "user" : "assistant", content: text })
          isUser = !isUser
        }
      }
    }

    const title = document.title.replace(/ \| ChatGPT$/, "").trim() || "ChatGPT conversation"

    return {
      title,
      source: "chatgpt",
      url: window.location.href,
      messages: messages.filter((m) => m.content.length > 0),
    }
  }

  // Listen for extraction requests from popup/background
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

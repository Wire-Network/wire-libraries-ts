/** Inject the provider script into the page context. */
function injectProvider(): void {
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL("inject.js")
  script.type = "module"
  ;(document.head || document.documentElement).appendChild(script)
  script.onload = () => {
    script.remove()
  }
}

/** Bridge messages from the injected provider (page) to the background service worker. */
function bridgePageToBackground(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return
    if (!event.data || event.data.direction !== "wire-wallet-to-content") return

    const { id, message } = event.data

    chrome.runtime.sendMessage(message, (response) => {
      window.postMessage(
        {
          direction: "wire-wallet-to-page",
          id,
          response,
        },
        "*"
      )
    })
  })
}

/** Forward wallet events from the background to the page context. */
function bridgeBackgroundToPage(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: any,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void
    ) => {
      if (message.type === "WALLET_EVENT") {
        window.postMessage(
          {
            direction: "wire-wallet-event",
            event: message.event,
            data: message.data,
          },
          "*"
        )
      }
    }
  )
}

export function initContentScript(): void {
  injectProvider()
  bridgePageToBackground()
  bridgeBackgroundToPage()
}

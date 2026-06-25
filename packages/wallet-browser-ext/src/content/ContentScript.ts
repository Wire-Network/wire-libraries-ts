import type {
  BackgroundMessage,
  BackgroundResponse,
  PageBackgroundMessage
} from "../Types"
import {
  PAGE_BACKGROUND_MESSAGE_TYPES,
  UNAUTHORIZED_PAGE_REQUEST_ERROR
} from "../PageBridge"

const PAGE_TO_CONTENT_DIRECTION = "wire-wallet-to-content"
const PAGE_TO_PAGE_DIRECTION = "wire-wallet-to-page"
const WALLET_EVENT_DIRECTION = "wire-wallet-event"
const WALLET_EVENT_MESSAGE_TYPE = "WALLET_EVENT"
const OPAQUE_PAGE_ORIGIN = "null"
const WILDCARD_TARGET_ORIGIN = "*"
let pageMessageListener: ((event: MessageEvent) => void) | null = null

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

/** Return a background-style response for page requests rejected by the bridge. */
function unauthorizedPageResponse(): BackgroundResponse {
  return { success: false, error: UNAUTHORIZED_PAGE_REQUEST_ERROR }
}

/** Check whether a page-originated message is part of the public provider surface. */
export function isPageBackgroundMessage(
  message: unknown
): message is PageBackgroundMessage {
  if (!message || typeof message !== "object") return false

  const type = (message as Partial<BackgroundMessage>).type
  return (
    typeof type === "string" &&
    PAGE_BACKGROUND_MESSAGE_TYPES.has(type as PageBackgroundMessage["type"])
  )
}

/** Resolve a precise target origin for page-bound provider messages. */
function resolvePageTargetOrigin(origin?: string): string {
  const targetOrigin = origin || window.location.origin
  return targetOrigin === OPAQUE_PAGE_ORIGIN
    ? WILDCARD_TARGET_ORIGIN
    : targetOrigin
}

/** Post a provider response back into the page context. */
function postPageResponse(
  id: unknown,
  response: BackgroundResponse,
  targetOrigin: string
): void {
  window.postMessage(
    {
      direction: PAGE_TO_PAGE_DIRECTION,
      id,
      response
    },
    targetOrigin
  )
}

/** Bridge messages from the injected provider (page) to the background service worker. */
function bridgePageToBackground(): void {
  if (pageMessageListener) {
    window.removeEventListener("message", pageMessageListener)
  }

  pageMessageListener = (event: MessageEvent) => {
    if (event.source !== window) return
    if (!event.data || event.data.direction !== PAGE_TO_CONTENT_DIRECTION)
      return

    const { id, message } = event.data
    const targetOrigin = resolvePageTargetOrigin(event.origin)

    if (!isPageBackgroundMessage(message)) {
      postPageResponse(id, unauthorizedPageResponse(), targetOrigin)
      return
    }

    chrome.runtime.sendMessage(message, response => {
      postPageResponse(id, response, targetOrigin)
    })
  }

  window.addEventListener("message", pageMessageListener)
}

/** Forward wallet events from the background to the page context. */
function bridgeBackgroundToPage(): void {
  chrome.runtime.onMessage.addListener(
    (
      message: any,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: any) => void
    ) => {
      if (message.type === WALLET_EVENT_MESSAGE_TYPE) {
        window.postMessage(
          {
            direction: WALLET_EVENT_DIRECTION,
            event: message.event,
            data: message.data
          },
          resolvePageTargetOrigin()
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

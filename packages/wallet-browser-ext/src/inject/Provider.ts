// SELF-CONTAINED provider injected into the page context
// No imports allowed - this runs in the page, not the extension

import { Checksum256 } from "@wireio/sdk-core"

declare global {
  interface Window {
    __WIRE_WALLET__?: any
  }
}

;(function () {
  type Listener = (data: any) => void

  interface PendingRequest {
    resolve: (value: any) => void
    reject: (reason: any) => void
  }

  const pendingRequests = new Map<string, PendingRequest>()
  const eventListeners = new Map<string, Set<Listener>>()

  function generateId(): string {
    return (
      Math.random().toString(36).substring(2) +
      Date.now().toString(36)
    )
  }

  function sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = generateId()
      pendingRequests.set(id, { resolve, reject })

      window.postMessage(
        {
          direction: "wire-wallet-to-content",
          id,
          message,
        },
        "*"
      )

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id)
          reject(new Error("Request timed out"))
        }
      }, 30000)
    })
  }

  // Listen for responses from content script
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return

    if (
      event.data &&
      event.data.direction === "wire-wallet-to-page"
    ) {
      const { id, response } = event.data
      const pending = pendingRequests.get(id)
      if (pending) {
        pendingRequests.delete(id)
        if (response && response.success) {
          pending.resolve(response.data)
        } else {
          pending.reject(
            new Error(
              response?.error ?? "Unknown error"
            )
          )
        }
      }
    }

    // Handle wallet events
    if (
      event.data &&
      event.data.direction === "wire-wallet-event"
    ) {
      const { event: eventName, data } = event.data
      const listeners = eventListeners.get(eventName)
      if (listeners) {
        listeners.forEach((listener) => {
          try {
            listener(data)
          } catch {
            // ignore listener errors
          }
        })
      }
    }
  })

  const wireWallet = {
    isWireWallet: true,
    version: "0.1.0",

    async isUnlocked(): Promise<boolean> {
      return sendMessage({ type: "IS_UNLOCKED" })
    },

    async getAccounts(): Promise<
      Array<{ id: string; name: string }>
    > {
      return sendMessage({ type: "GET_ACCOUNTS" })
    },

    async signTransaction(
      digest: Checksum256,
      accountId: string
    ): Promise<string> {
      return sendMessage({
        type: "SIGN_REQUEST",
        payload: { digest, accountId },
      })
    },

    on(event: string, listener: Listener): void {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set())
      }
      eventListeners.get(event)!.add(listener)
    },

    removeListener(event: string, listener: Listener): void {
      const listeners = eventListeners.get(event)
      if (listeners) {
        listeners.delete(listener)
        if (listeners.size === 0) {
          eventListeners.delete(event)
        }
      }
    },
  }

  window.__WIRE_WALLET__ = wireWallet
})()

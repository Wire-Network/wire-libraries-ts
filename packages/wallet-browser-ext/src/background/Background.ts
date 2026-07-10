import { Checksum256, PrivateKey } from "@wireio/sdk-core"
import { saveEncryptedState, loadEncryptedState, hasVault } from "../Storage.js"
import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionState
} from "../Types.js"

/** Name of the Chrome alarm that expires the unlocked wallet session. */
const AUTO_LOCK_ALARM_NAME = "wire-wallet-auto-lock"

/** Documented wallet inactivity window before decrypted state is discarded. */
const AUTO_LOCK_DURATION_MS = 15 * 60 * 1000

let currentState: ExtensionState | null = null
let currentPassword: string | null = null
let lockDeadlineMs: number | null = null

/** Schedule Chrome to wake the service worker at the current lock deadline. */
function scheduleLockAlarm(deadlineMs: number): void {
  void chrome.alarms.create(AUTO_LOCK_ALARM_NAME, { when: deadlineMs })
}

/** Start a new inactivity window for the current unlocked session. */
function resetLockTimer(): void {
  lockDeadlineMs = Date.now() + AUTO_LOCK_DURATION_MS
  scheduleLockAlarm(lockDeadlineMs)
}

/** Clear all decrypted session material and cancel its scheduled alarm. */
function lock(): void {
  currentState = null
  currentPassword = null
  lockDeadlineMs = null
  void chrome.alarms.clear(AUTO_LOCK_ALARM_NAME)
}

/** Clear an unlocked session whose inactivity deadline has elapsed. */
function lockIfExpired(): void {
  if (lockDeadlineMs !== null && Date.now() >= lockDeadlineMs) {
    lock()
  }
}

/** Process the wallet auto-lock alarm without honoring stale alarm events. */
function handleLockAlarm(alarm: chrome.alarms.Alarm): void {
  if (alarm.name !== AUTO_LOCK_ALARM_NAME) {
    return
  }

  lockIfExpired()

  if (lockDeadlineMs !== null) {
    scheduleLockAlarm(lockDeadlineMs)
  }
}

/** Handle a request sent to the wallet background service worker. */
async function handleMessage(
  message: BackgroundMessage
): Promise<BackgroundResponse> {
  lockIfExpired()

  switch (message.type) {
    case "HAS_VAULT": {
      const exists = await hasVault()
      return { success: true, data: exists }
    }

    case "IS_UNLOCKED": {
      return { success: true, data: currentState !== null }
    }

    case "SETUP": {
      const initialState = message.initialState
      await saveEncryptedState(initialState, message.password)
      currentState = initialState
      currentPassword = message.password
      resetLockTimer()
      return { success: true }
    }

    case "UNLOCK": {
      try {
        const state = await loadEncryptedState(message.password)
        currentState = state
        currentPassword = message.password
        resetLockTimer()
        return { success: true, data: state }
      } catch {
        return { success: false, error: "Invalid password" }
      }
    }

    case "LOCK": {
      lock()
      return { success: true }
    }

    case "GET_STATE": {
      if (!currentState) {
        return { success: false, error: "Wallet is locked" }
      }
      resetLockTimer()
      return { success: true, data: currentState }
    }

    case "SAVE_STATE": {
      if (!currentPassword) {
        return { success: false, error: "Wallet is locked" }
      }
      currentState = message.state
      await saveEncryptedState(message.state, currentPassword)
      resetLockTimer()
      return { success: true }
    }

    case "GET_ACCOUNTS": {
      if (!currentState) {
        return { success: false, error: "Wallet is locked" }
      }
      resetLockTimer()
      const accounts = currentState.accounts.map(a => ({
        id: a.id,
        name: a.name
      }))
      return { success: true, data: accounts }
    }

    case "SIGN_REQUEST": {
      if (!currentState) {
        return { success: false, error: "Wallet is locked" }
      }

      const { digest: digestHex, accountId } = message.payload
      const account = currentState.accounts.find(a => a.id === accountId)
      if (!account) {
        return { success: false, error: "Account not found" }
      }

      // Use active account key if available, otherwise first key
      const activeKeyId =
        currentState.activeAccount?.accountId === accountId
          ? currentState.activeAccount.keyId
          : account.keys[0]

      const keyPair = currentState.keys.find(k => k.id === activeKeyId)
      if (!keyPair) {
        return { success: false, error: "Key not found" }
      }

      try {
        const digest = Checksum256.fromHexString(digestHex)
        const privateKey = PrivateKey.fromString(keyPair.privateKey)
        const signature = privateKey.signDigest(digest)
        resetLockTimer()
        return { success: true, data: signature }
      } catch (err: any) {
        return {
          success: false,
          error: `Signing failed: ${err?.message ?? String(err)}`
        }
      }
    }

    default: {
      return { success: false, error: "Unknown message type" }
    }
  }
}

/** Register background message and auto-lock alarm listeners. */
export function initBackground(): void {
  chrome.alarms.onAlarm.addListener(handleLockAlarm)
  chrome.runtime.onMessage.addListener(
    (
      message: BackgroundMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: BackgroundResponse) => void
    ) => {
      handleMessage(message)
        .then(sendResponse)
        .catch(err =>
          sendResponse({ success: false, error: err?.message ?? String(err) })
        )
      return true // keep channel open for async response
    }
  )
}

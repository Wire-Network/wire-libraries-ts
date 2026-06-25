import {
  KeyType,
  type BackgroundMessage,
  type BackgroundResponse,
  type ExtensionState
} from "../src/Types"
import { UNAUTHORIZED_PAGE_REQUEST_ERROR } from "../src/PageBridge"

type BackgroundListener = (
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
) => true | void

const extensionSender = {
  id: "wire-wallet-extension",
  url: "chrome-extension://wallet/popup.html"
} as chrome.runtime.MessageSender

const extensionTabSender = {
  id: "wire-wallet-extension",
  url: "chrome-extension://wallet/popup.html",
  tab: {
    id: 7,
    url: "chrome-extension://wallet/popup.html"
  } as chrome.tabs.Tab
} as chrome.runtime.MessageSender

const pageSender = {
  id: "wire-wallet-extension",
  origin: "https://attacker.example",
  url: "https://attacker.example/",
  tab: {
    id: 42,
    url: "https://attacker.example/"
  } as chrome.tabs.Tab
} as chrome.runtime.MessageSender

const unlockedState: ExtensionState = {
  keys: [
    {
      id: "key-1",
      name: "primary",
      type: KeyType.K1,
      privateKey: "PVT_K1_secret",
      publicKey: "PUB_K1_public"
    }
  ],
  endpoints: [],
  accounts: [
    {
      id: "acct-1",
      name: "alice",
      endpoints: [],
      keys: ["key-1"]
    }
  ],
  activeAccount: {
    accountId: "acct-1",
    keyId: "key-1",
    endpointId: "endpoint-1"
  }
}

function installChromeMock(): { getListener: () => BackgroundListener } {
  let listener: BackgroundListener | undefined
  ;(globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: jest.fn((nextListener: BackgroundListener) => {
          listener = nextListener
        })
      }
    },
    storage: {
      local: {
        get: jest.fn(async () => ({})),
        remove: jest.fn(async () => undefined),
        set: jest.fn(async () => undefined)
      }
    }
  }

  return {
    getListener: () => {
      if (!listener) throw new Error("Background listener was not registered")
      return listener
    }
  }
}

function initListener(): BackgroundListener {
  jest.resetModules()
  const chromeMock = installChromeMock()
  const { initBackground } =
    require("../src/background/Background") as typeof import("../src/background/Background.js")
  initBackground()
  return chromeMock.getListener()
}

function sendBackgroundMessage(
  listener: BackgroundListener,
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender
): Promise<BackgroundResponse> {
  return new Promise(resolve => {
    listener(message, sender, resolve)
  })
}

describe("Background runtime trust boundary", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as any).chrome
  })

  it("keeps full state available to extension UI messages", async () => {
    const listener = initListener()

    await expect(
      sendBackgroundMessage(
        listener,
        {
          type: "SETUP",
          password: "secret",
          initialState: unlockedState
        },
        extensionSender
      )
    ).resolves.toEqual({ success: true })

    await expect(
      sendBackgroundMessage(listener, { type: "GET_STATE" }, extensionSender)
    ).resolves.toEqual({ success: true, data: unlockedState })
  })

  it("keeps extension pages trusted when the popup is opened in a tab", async () => {
    const listener = initListener()

    await sendBackgroundMessage(
      listener,
      {
        type: "SETUP",
        password: "secret",
        initialState: unlockedState
      },
      extensionSender
    )

    await expect(
      sendBackgroundMessage(listener, { type: "GET_STATE" }, extensionTabSender)
    ).resolves.toEqual({ success: true, data: unlockedState })
  })

  it("rejects content-script attempts to read unlocked private-key state", async () => {
    const listener = initListener()

    await sendBackgroundMessage(
      listener,
      {
        type: "SETUP",
        password: "secret",
        initialState: unlockedState
      },
      extensionSender
    )

    const response = await sendBackgroundMessage(
      listener,
      { type: "GET_STATE" },
      pageSender
    )

    expect(response).toEqual({
      success: false,
      error: UNAUTHORIZED_PAGE_REQUEST_ERROR
    })
    expect(JSON.stringify(response)).not.toContain("PVT_K1_secret")
  })

  it("rejects privileged content-script commands before dispatch", async () => {
    const listener = initListener()
    const privilegedMessages: BackgroundMessage[] = [
      { type: "GET_STATE" },
      { type: "SAVE_STATE", state: unlockedState },
      { type: "SETUP", password: "secret", initialState: unlockedState },
      { type: "UNLOCK", password: "secret" },
      { type: "LOCK" },
      {
        type: "SIGN_REQUEST",
        payload: { digest: "00", accountId: "acct-1" }
      },
      { type: "HAS_VAULT" }
    ]

    await Promise.all(
      privilegedMessages.map(async message => {
        await expect(
          sendBackgroundMessage(listener, message, pageSender)
        ).resolves.toEqual({
          success: false,
          error: UNAUTHORIZED_PAGE_REQUEST_ERROR
        })
      })
    )
  })

  it("allows only sanitized page-safe provider commands from content scripts", async () => {
    const listener = initListener()

    await sendBackgroundMessage(
      listener,
      {
        type: "SETUP",
        password: "secret",
        initialState: unlockedState
      },
      extensionSender
    )

    await expect(
      sendBackgroundMessage(listener, { type: "IS_UNLOCKED" }, pageSender)
    ).resolves.toEqual({ success: true, data: true })

    await expect(
      sendBackgroundMessage(listener, { type: "GET_ACCOUNTS" }, pageSender)
    ).resolves.toEqual({
      success: true,
      data: [{ id: "acct-1", name: "alice" }]
    })
  })
})

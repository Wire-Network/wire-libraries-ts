import {
  initContentScript,
  isPageBackgroundMessage
} from "../src/content/ContentScript"
import { UNAUTHORIZED_PAGE_REQUEST_ERROR } from "../src/PageBridge"

const PAGE_TO_CONTENT_DIRECTION = "wire-wallet-to-content"
const PAGE_TO_PAGE_DIRECTION = "wire-wallet-to-page"
const PAGE_ORIGIN = "https://app.example"

function installChromeMock(
  sendMessage: jest.Mock,
  addListener = jest.fn()
): void {
  ;(globalThis as any).chrome = {
    runtime: {
      getURL: jest.fn((path: string) => `chrome-extension://wallet/${path}`),
      onMessage: {
        addListener
      },
      sendMessage
    }
  }
}

function dispatchPageMessage(id: string, message: unknown): void {
  const event = new MessageEvent("message", {
    data: {
      direction: PAGE_TO_CONTENT_DIRECTION,
      id,
      message
    },
    origin: PAGE_ORIGIN
  })

  Object.defineProperty(event, "source", {
    value: window
  })

  window.dispatchEvent(event)
}

describe("ContentScript page bridge", () => {
  afterEach(() => {
    document.head.innerHTML = ""
    jest.restoreAllMocks()
    delete (globalThis as any).chrome
  })

  it("allows only the page-safe provider message types", () => {
    expect(isPageBackgroundMessage({ type: "IS_UNLOCKED" })).toBe(true)
    expect(isPageBackgroundMessage({ type: "GET_ACCOUNTS" })).toBe(true)
    expect(isPageBackgroundMessage({ type: "GET_STATE" })).toBe(false)
    expect(isPageBackgroundMessage({ type: "SAVE_STATE", state: {} })).toBe(
      false
    )
    expect(
      isPageBackgroundMessage({
        type: "SIGN_REQUEST",
        payload: { digest: "00", accountId: "acct-1" }
      })
    ).toBe(false)
  })

  it("rejects crafted privileged page messages before runtime forwarding", () => {
    const sendMessage = jest.fn()
    const postMessage = jest
      .spyOn(window, "postMessage")
      .mockImplementation(() => undefined)

    installChromeMock(sendMessage)
    initContentScript()

    dispatchPageMessage("req-1", { type: "GET_STATE" })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith(
      {
        direction: PAGE_TO_PAGE_DIRECTION,
        id: "req-1",
        response: {
          success: false,
          error: UNAUTHORIZED_PAGE_REQUEST_ERROR
        }
      },
      PAGE_ORIGIN
    )
  })

  it("forwards page-safe provider messages to the background", () => {
    const sendMessage = jest.fn((_message, respond) =>
      respond({ success: true, data: true })
    )
    const postMessage = jest
      .spyOn(window, "postMessage")
      .mockImplementation(() => undefined)

    installChromeMock(sendMessage)
    initContentScript()

    dispatchPageMessage("req-2", { type: "IS_UNLOCKED" })

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(
      { type: "IS_UNLOCKED" },
      expect.any(Function)
    )
    expect(postMessage).toHaveBeenCalledWith(
      {
        direction: PAGE_TO_PAGE_DIRECTION,
        id: "req-2",
        response: { success: true, data: true }
      },
      PAGE_ORIGIN
    )
  })
})

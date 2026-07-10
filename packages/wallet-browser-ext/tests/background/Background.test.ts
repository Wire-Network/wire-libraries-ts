import {
  KeyType,
  type BackgroundMessage,
  type BackgroundResponse,
  type ExtensionState
} from "../../src/Types.js"

jest.mock("@wireio/sdk-core", () => ({
  KeyType: {
    K1: "K1"
  },
  Checksum256: {
    fromHexString: jest.fn(() => "digest")
  },
  PrivateKey: {
    fromString: jest.fn(() => ({
      signDigest: jest.fn(() => "signature")
    }))
  }
}))

jest.mock("../../src/Storage.js", () => ({
  hasVault: jest.fn(),
  loadEncryptedState: jest.fn(),
  saveEncryptedState: jest.fn()
}))

import { loadEncryptedState, saveEncryptedState } from "../../src/Storage.js"
import { initBackground } from "../../src/background/Background.js"

const SESSION_START_MS = Date.UTC(2026, 6, 10, 12)
const EXPECTED_AUTO_LOCK_DURATION_MS = 15 * 60 * 1000
const NEXT_OPERATION_OFFSET_MS = 1_000
const SIGNING_ACCOUNT_ID = "account-1"

const SAMPLE_STATE: ExtensionState = {
  keys: [
    {
      id: "key-1",
      name: "signing-key",
      type: KeyType.K1,
      privateKey: "private-key",
      publicKey: "public-key"
    }
  ],
  endpoints: [],
  accounts: [
    {
      id: SIGNING_ACCOUNT_ID,
      name: "account",
      endpoints: [],
      keys: ["key-1"]
    }
  ]
}

type RuntimeMessageListener = (
  message: BackgroundMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: BackgroundResponse) => void
) => boolean

type AlarmListener = (alarm: chrome.alarms.Alarm) => void

let runtimeMessageListener: RuntimeMessageListener
let alarmListener: AlarmListener

const createAlarm = jest.fn()
const clearAlarm = jest.fn(() => Promise.resolve(true))
const addRuntimeMessageListener = jest.fn(
  (listener: RuntimeMessageListener) => {
    runtimeMessageListener = listener
  }
)
const addAlarmListener = jest.fn((listener: AlarmListener) => {
  alarmListener = listener
})

const chromeMock = {
  runtime: {
    onMessage: {
      addListener: addRuntimeMessageListener
    }
  },
  alarms: {
    create: createAlarm,
    clear: clearAlarm,
    onAlarm: {
      addListener: addAlarmListener
    }
  }
}

const mockLoadEncryptedState = jest.mocked(loadEncryptedState)
const mockSaveEncryptedState = jest.mocked(saveEncryptedState)

/** Send a message through the registered Chrome runtime listener. */
function sendMessage(message: BackgroundMessage): Promise<BackgroundResponse> {
  return new Promise(resolve => {
    const keepsChannelOpen = runtimeMessageListener(
      message,
      {} as chrome.runtime.MessageSender,
      resolve
    )
    expect(keepsChannelOpen).toBe(true)
  })
}

/** Return the most recently scheduled wallet alarm name. */
function scheduledAlarmName(): string {
  const lastCall = createAlarm.mock.calls.at(-1)
  expect(lastCall).toBeDefined()
  return lastCall![0]
}

/** Deliver a Chrome alarm event to the registered listener. */
function deliverAlarm(name: string): void {
  alarmListener({ name, scheduledTime: Date.now() })
}

describe("Background auto-lock", () => {
  beforeEach(async () => {
    jest.useFakeTimers()
    jest.setSystemTime(SESSION_START_MS)
    jest.clearAllMocks()
    mockLoadEncryptedState.mockResolvedValue(SAMPLE_STATE)
    mockSaveEncryptedState.mockResolvedValue()
    Object.defineProperty(globalThis, "chrome", {
      value: chromeMock,
      configurable: true,
      writable: true
    })
    initBackground()
    await sendMessage({ type: "LOCK" })
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("schedules the documented deadline after setup and unlock", async () => {
    await expect(
      sendMessage({
        type: "SETUP",
        password: "password",
        initialState: SAMPLE_STATE
      })
    ).resolves.toEqual({ success: true })
    expect(createAlarm).toHaveBeenLastCalledWith(expect.any(String), {
      when: SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS
    })

    await sendMessage({ type: "LOCK" })
    createAlarm.mockClear()
    await expect(
      sendMessage({ type: "UNLOCK", password: "password" })
    ).resolves.toEqual({ success: true, data: SAMPLE_STATE })
    expect(createAlarm).toHaveBeenLastCalledWith(expect.any(String), {
      when: SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS
    })
  })

  it("clears decrypted state and password when the alarm reaches the deadline", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    const alarmName = scheduledAlarmName()
    jest.setSystemTime(SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS)

    deliverAlarm(alarmName)
    expect(clearAlarm).toHaveBeenCalledWith(alarmName)
    jest.setSystemTime(SESSION_START_MS)

    await expect(sendMessage({ type: "GET_STATE" })).resolves.toEqual({
      success: false,
      error: "Wallet is locked"
    })
    await expect(
      sendMessage({ type: "SAVE_STATE", state: SAMPLE_STATE })
    ).resolves.toEqual({ success: false, error: "Wallet is locked" })
  })

  it("enforces the deadline before handling a message when the alarm is delayed", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    jest.setSystemTime(SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS)

    await expect(sendMessage({ type: "IS_UNLOCKED" })).resolves.toEqual({
      success: true,
      data: false
    })
  })

  it("keeps a refreshed session unlocked when a stale alarm arrives", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    const alarmName = scheduledAlarmName()
    const originalDeadline = SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS
    const refreshedDeadline = originalDeadline + NEXT_OPERATION_OFFSET_MS
    jest.setSystemTime(SESSION_START_MS + NEXT_OPERATION_OFFSET_MS)

    await expect(sendMessage({ type: "GET_STATE" })).resolves.toEqual({
      success: true,
      data: SAMPLE_STATE
    })
    jest.setSystemTime(originalDeadline)
    deliverAlarm(alarmName)

    await expect(sendMessage({ type: "IS_UNLOCKED" })).resolves.toEqual({
      success: true,
      data: true
    })
    expect(createAlarm).toHaveBeenLastCalledWith(alarmName, {
      when: refreshedDeadline
    })
  })

  it("ignores alarms that do not belong to the wallet session", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    createAlarm.mockClear()
    clearAlarm.mockClear()

    deliverAlarm("unrelated-alarm")

    expect(createAlarm).not.toHaveBeenCalled()
    expect(clearAlarm).not.toHaveBeenCalled()
    await expect(sendMessage({ type: "IS_UNLOCKED" })).resolves.toEqual({
      success: true,
      data: true
    })
  })

  it("cancels the alarm when the wallet is explicitly locked", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    const alarmName = scheduledAlarmName()
    clearAlarm.mockClear()

    await expect(sendMessage({ type: "LOCK" })).resolves.toEqual({
      success: true
    })

    expect(clearAlarm).toHaveBeenCalledWith(alarmName)
    await expect(sendMessage({ type: "IS_UNLOCKED" })).resolves.toEqual({
      success: true,
      data: false
    })
  })

  it("refreshes the deadline after successful privileged operations", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    const alarmName = scheduledAlarmName()
    createAlarm.mockClear()

    const messages: BackgroundMessage[] = [
      { type: "GET_STATE" },
      { type: "SAVE_STATE", state: SAMPLE_STATE },
      {
        type: "SIGN_REQUEST",
        payload: { digest: "digest", accountId: SIGNING_ACCOUNT_ID }
      }
    ]

    await messages.reduce(async (previous, message, index) => {
      await previous
      const operationTime = SESSION_START_MS + (index + 1)
      jest.setSystemTime(operationTime)
      const response = await sendMessage(message)
      expect(response.success).toBe(true)
      expect(createAlarm).toHaveBeenLastCalledWith(alarmName, {
        when: operationTime + EXPECTED_AUTO_LOCK_DURATION_MS
      })
    }, Promise.resolve())
    expect(createAlarm).toHaveBeenCalledTimes(messages.length)
  })

  it("does not refresh the deadline after a passive account read", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    createAlarm.mockClear()
    jest.setSystemTime(SESSION_START_MS + NEXT_OPERATION_OFFSET_MS)

    await expect(sendMessage({ type: "GET_ACCOUNTS" })).resolves.toEqual({
      success: true,
      data: [{ id: SIGNING_ACCOUNT_ID, name: "account" }]
    })
    expect(createAlarm).not.toHaveBeenCalled()

    jest.setSystemTime(SESSION_START_MS + EXPECTED_AUTO_LOCK_DURATION_MS)
    await expect(sendMessage({ type: "IS_UNLOCKED" })).resolves.toEqual({
      success: true,
      data: false
    })
  })

  it("does not refresh the deadline after a rejected signing request", async () => {
    await sendMessage({
      type: "SETUP",
      password: "password",
      initialState: SAMPLE_STATE
    })
    createAlarm.mockClear()

    await expect(
      sendMessage({
        type: "SIGN_REQUEST",
        payload: { digest: "digest", accountId: "missing-account" }
      })
    ).resolves.toEqual({ success: false, error: "Account not found" })
    expect(createAlarm).not.toHaveBeenCalled()
  })
})

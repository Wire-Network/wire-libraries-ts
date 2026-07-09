import {
  P2PDataHandler,
  P2PErrorHandler,
  P2PEventMap,
  P2PHandler,
  P2PProvider,
  SimpleEnvelopeP2PProvider
} from "@wireio/sdk-core/p2p/Provider"

const P2PProviderEvent = {
  data: "data",
  error: "error",
  close: "close"
} as const
const MessageLengthPrefixBytes = 4
const IncomingMessageTooLongError = /Incoming Message too long/
const PayloadBytes = Uint8Array.from([0x01, 0x02, 0x03])
const OversizeMessageLength = SimpleEnvelopeP2PProvider.maxReadLength + 1
const ThrowingErrorHandlerMessage = "throwing test handler"

/**
 * In-memory lower provider used to drive the SimpleEnvelope parser directly.
 */
class MemoryP2PProvider implements P2PProvider {
  readonly writtenMessages: Uint8Array[] = []
  destroyedWith?: Error
  ended = false

  private readonly dataHandlers: P2PDataHandler[] = []
  private readonly errorHandlers: P2PErrorHandler[] = []
  private readonly closeHandlers: P2PHandler[] = []

  write(encodedMessage: Uint8Array, done?: P2PHandler): void {
    this.writtenMessages.push(encodedMessage)
    done?.()
  }

  end(cb?: P2PHandler): void {
    this.ended = true
    cb?.()
  }

  destroy(err?: Error): void {
    this.destroyedWith = err
  }

  on<T extends keyof P2PEventMap>(event: T, handler: P2PEventMap[T]): this {
    if (event === P2PProviderEvent.data) {
      this.dataHandlers.push(handler as P2PDataHandler)
    } else if (event === P2PProviderEvent.error) {
      this.errorHandlers.push(handler as P2PErrorHandler)
    } else {
      this.closeHandlers.push(handler as P2PHandler)
    }

    return this
  }

  emitData(data: Uint8Array): void {
    this.dataHandlers.forEach(handler => handler(data))
  }

  emitError(error: Error): void {
    this.errorHandlers.forEach(handler => handler(error))
  }

  emitClose(): void {
    this.closeHandlers.forEach(handler => handler())
  }
}

/**
 * Encodes one SimpleEnvelope frame.
 */
function createFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(MessageLengthPrefixBytes + payload.byteLength)
  const view = new DataView(frame.buffer)

  view.setUint32(0, payload.byteLength, true)
  frame.set(payload, MessageLengthPrefixBytes)

  return frame
}

/**
 * Encodes only a SimpleEnvelope length prefix.
 */
function createLengthPrefix(messageLength: number): Uint8Array {
  const prefix = new Uint8Array(MessageLengthPrefixBytes)
  const view = new DataView(prefix.buffer)

  view.setUint32(0, messageLength, true)

  return prefix
}

describe("SimpleEnvelopeP2PProvider", () => {
  test("reassembles chunked frames before emitting data", () => {
    const lowerProvider = new MemoryP2PProvider()
    const provider = new SimpleEnvelopeP2PProvider(lowerProvider)
    const messages: Uint8Array[] = []

    provider.on(P2PProviderEvent.data, message => messages.push(message))

    const frame = createFrame(PayloadBytes)
    lowerProvider.emitData(frame.subarray(0, MessageLengthPrefixBytes + 1))
    lowerProvider.emitData(frame.subarray(MessageLengthPrefixBytes + 1))

    expect(messages.map(message => Array.from(message))).toEqual([
      Array.from(PayloadBytes)
    ])
    expect(lowerProvider.destroyedWith).toBeUndefined()
  })

  test("destroys the lower provider when a peer declares an oversized frame", () => {
    const lowerProvider = new MemoryP2PProvider()
    const provider = new SimpleEnvelopeP2PProvider(lowerProvider)
    const errors: Error[] = []
    const messages: Uint8Array[] = []

    provider.on(P2PProviderEvent.error, error => errors.push(error))
    provider.on(P2PProviderEvent.data, message => messages.push(message))

    lowerProvider.emitData(createLengthPrefix(OversizeMessageLength))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(IncomingMessageTooLongError)
      })
    )
    expect(lowerProvider.destroyedWith).toBe(errors[0])
    expect(messages).toEqual([])
  })

  test("ignores later chunks after closing an oversized frame", () => {
    const lowerProvider = new MemoryP2PProvider()
    const provider = new SimpleEnvelopeP2PProvider(lowerProvider)
    const errors: Error[] = []
    const messages: Uint8Array[] = []

    provider.on(P2PProviderEvent.error, error => errors.push(error))
    provider.on(P2PProviderEvent.data, message => messages.push(message))

    lowerProvider.emitData(createLengthPrefix(OversizeMessageLength))
    lowerProvider.emitData(createFrame(PayloadBytes))
    lowerProvider.emitError(new Error("late lower-provider error"))

    expect(errors).toHaveLength(1)
    expect(messages).toEqual([])
    expect(lowerProvider.destroyedWith).toBe(errors[0])
  })

  test("destroys the lower provider when the oversize error handler throws", () => {
    const lowerProvider = new MemoryP2PProvider()
    const provider = new SimpleEnvelopeP2PProvider(lowerProvider)
    let emittedError: Error | undefined

    provider.on(P2PProviderEvent.error, error => {
      emittedError = error
      throw new Error(ThrowingErrorHandlerMessage)
    })

    expect(() =>
      lowerProvider.emitData(createLengthPrefix(OversizeMessageLength))
    ).toThrow(ThrowingErrorHandlerMessage)
    expect(emittedError).toEqual(
      expect.objectContaining({
        message: expect.stringMatching(IncomingMessageTooLongError)
      })
    )
    expect(lowerProvider.destroyedWith).toBe(emittedError)
  })
})

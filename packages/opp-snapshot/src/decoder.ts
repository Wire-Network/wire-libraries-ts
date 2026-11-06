import { Either } from "@3fv/prelude-ts"
import { identity } from "lodash"
import { match } from "ts-pattern"
import { getLogger } from "@wireio/shared"

import {
  OppArgumentType,
  OppAssertionSchemas,
  isOppAssertionType
} from "./OppAssertionType.js"
import { OppConstants } from "./OppConstants.js"
import type {
  AssertionRow,
  DecodedAssertion,
  DecodedOppMessage,
  OppWarn,
  RawLog
} from "./OppTypes.js"

const log = getLogger("@wireio/opp-snapshot/decoder")

/** Bytes in one ABI word. */
const AbiWordBytes = 32
/** Bytes in a packed little-endian `uint32`. */
const Uint32Bytes = 4
/** Bits in a packed little-endian `uint32`. */
const Uint32Bits = 32n
/** Packed `uint32` words in a packed `uint256`. */
const PackedUint256Words = 8
/** The payload bits of one LEB128 byte. */
const VaruintPayloadMask = 0x7f
/** The continuation bit of one LEB128 byte. */
const VaruintContinuationBit = 0x80
/** Bits each LEB128 byte contributes. */
const VaruintBitsPerByte = 7
/** The ABI word holding the payload tuple's offset: after the four inline header words. */
const PayloadOffsetWord = 4
/** The radix of the hex quantities a node reports block numbers in. */
const HexRadix = 16
/** The prefix of a hex string. */
const HexPrefix = "0x"

/** The default diagnostic sink: this module's logger. */
const defaultWarn: OppWarn = message => log.warn(message)

/**
 * A reader over the packed (non-ABI) assertion payload encoding: LEB128
 * length-prefixed byte strings and little-endian `uint32`s.
 */
class PackedReader {
  private position = 0

  constructor(private readonly buffer: Buffer) {}

  /** A LEB128 `varuint32`. */
  readVaruint32(): number {
    let value = 0,
      shift = 0,
      byte: number
    do {
      byte = this.buffer[this.position++]
      value |= (byte & VaruintPayloadMask) << shift
      shift += VaruintBitsPerByte
    } while ((byte & VaruintContinuationBit) !== 0)
    return value
  }

  /** A `varuint32`-length-prefixed byte string. */
  readBytes(): Buffer {
    const length = this.readVaruint32(),
      bytes = this.buffer.subarray(this.position, this.position + length)
    this.position += length
    return bytes
  }

  /** A little-endian `uint32`; throws past the end of the payload. */
  readUint32(): number {
    const value = this.buffer.readUInt32LE(this.position)
    this.position += Uint32Bytes
    return value
  }

  /** A `uint256` packed as eight little-endian `uint32` words, least significant first. */
  readUint256(): bigint {
    return Array.from({ length: PackedUint256Words }, () => BigInt(this.readUint32())).reduce(
      (value, word, index) => value | (word << (BigInt(index) * Uint32Bits)),
      0n
    )
  }

  /** A `uint64` packed as two little-endian `uint32` words, low first. */
  readUint64(): bigint {
    const low = BigInt(this.readUint32()),
      high = BigInt(this.readUint32())
    return low | (high << Uint32Bits)
  }
}

/** Bytes as 0x-hex. */
function toHex(bytes: Buffer): string {
  return `${HexPrefix}${bytes.toString("hex")}`
}

/** The ABI word at `offset` as a bigint; throws when the word runs past the data. */
function readAbiWord(buffer: Buffer, offset: number): bigint {
  const word = buffer.subarray(offset, offset + AbiWordBytes)
  if (word.length !== AbiWordBytes) {
    throw new RangeError(
      `ABI word at offset ${offset} runs past the ${buffer.length}-byte event data`
    )
  }
  return BigInt(toHex(word))
}

/** The ABI word at `offset` as a number, for offsets and lengths: its low four bytes. */
function readAbiWordAsNumber(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset + AbiWordBytes - Uint32Bytes)
}

/** One packed argument, as the string the arguments record stores. */
function readArgument(reader: PackedReader, type: OppArgumentType): string {
  return match(type)
    .with(OppArgumentType.address, OppArgumentType.bytes32, () => toHex(reader.readBytes()))
    .with(OppArgumentType.uint256, () => reader.readUint256().toString())
    .with(OppArgumentType.uint64, () => reader.readUint64().toString())
    .exhaustive()
}

/**
 * Whether a log is an `OPPMessage` emitted by the given OPP contract.
 *
 * @param rawLog - The log.
 * @param oppAddress - The OPP contract.
 * @returns True for an `OPPMessage` of that contract.
 */
export function isOppLog(rawLog: RawLog, oppAddress: string): boolean {
  return (
    rawLog.address.toLowerCase() === oppAddress.toLowerCase() &&
    rawLog.topics.length > 0 &&
    rawLog.topics[0].toLowerCase() === OppConstants.OppMessageTopic0.toLowerCase()
  )
}

/**
 * Decode the packed (non-ABI) payload of one assertion.
 *
 * @param assertionType - The assertion's raw `uint16` tag.
 * @param data - The assertion's payload bytes.
 * @param warn - Where a decode failure is reported.
 * @returns The assertion; `null` for a tag the decoder does not know or a payload that does not decode.
 */
export function decodeAssertionBytes(
  assertionType: number,
  data: Buffer,
  warn: OppWarn = defaultWarn
): DecodedAssertion {
  if (!isOppAssertionType(assertionType)) return null
  const schema = OppAssertionSchemas[assertionType]
  return Either.try(() => {
    const reader = new PackedReader(data)
    return {
      assertionType,
      args: Object.fromEntries(
        schema.arguments.map(argument => [argument.name, readArgument(reader, argument.type)])
      )
    }
  }).match({
    Left: error => {
      warn(`Failed to decode assertion type ${assertionType}: ${error}`)
      return null
    },
    Right: identity
  })
}

/** Decode the ABI-encoded `OPPMessage` data; throws on data that does not decode. */
function decodeOppMessageData(data: string, warn: OppWarn): DecodedOppMessage {
  const buffer = Buffer.from(data.startsWith(HexPrefix) ? data.slice(HexPrefix.length) : data, "hex"),
    word = (index: number) => index * AbiWordBytes,
    // The header is a STATIC tuple encoded inline at offset 0; the payload a
    // DYNAMIC tuple referenced by the offset in the word after it.
    header = {
      messageId: toHex(buffer.subarray(word(0), word(1))),
      previousMessageId: toHex(buffer.subarray(word(1), word(2))),
      payloadHash: toHex(buffer.subarray(word(2), word(3))),
      timestamp: readAbiWord(buffer, word(3))
    },
    payloadOffset = readAbiWordAsNumber(buffer, word(PayloadOffsetWord)),
    protocolVersion = Number(readAbiWord(buffer, payloadOffset)),
    encodingFlags = Number(readAbiWord(buffer, payloadOffset + word(1))),
    // The assertions array's offset is relative to the payload; each element is
    // a dynamic (uint16, bytes) tuple referenced by an offset after the length.
    arrayOffset = payloadOffset + readAbiWordAsNumber(buffer, payloadOffset + word(2)),
    count = readAbiWordAsNumber(buffer, arrayOffset),
    elementsStart = arrayOffset + word(1),
    assertions = Array.from({ length: count }, (_, index) => {
      const elementOffset = elementsStart + readAbiWordAsNumber(buffer, elementsStart + word(index)),
        assertionType = Number(readAbiWord(buffer, elementOffset)),
        bytesOffset = elementOffset + readAbiWordAsNumber(buffer, elementOffset + word(1)),
        bytesLength = readAbiWordAsNumber(buffer, bytesOffset),
        bytes = buffer.subarray(bytesOffset + word(1), bytesOffset + word(1) + bytesLength)
      return decodeAssertionBytes(assertionType, bytes, warn)
    }).filter(assertion => assertion != null)
  return { header, protocolVersion, encodingFlags, assertions }
}

/**
 * Decode a raw log into its `OPPMessage`: the ABI-encoded event, then each
 * assertion's packed payload. Assertions of unknown types are dropped.
 *
 * @param rawLog - The log.
 * @param oppAddress - The OPP contract whose messages are decoded.
 * @param warn - Where a decode failure is reported.
 * @returns The message; `null` when the log is not an `OPPMessage` of `oppAddress` or does not decode.
 */
export function decodeOppLog(
  rawLog: RawLog,
  oppAddress: string,
  warn: OppWarn = defaultWarn
): DecodedOppMessage {
  if (!isOppLog(rawLog, oppAddress)) return null
  return Either.try(() => decodeOppMessageData(rawLog.data, warn)).match({
    Left: error => {
      warn(`Failed to decode OPP log: ${error}`)
      return null
    },
    Right: identity
  })
}

/**
 * Flatten a decoded log into one row per assertion, positioned for ordering.
 *
 * @param rawLog - The log the message came from.
 * @param decoded - Its decoded message.
 * @returns One row per assertion, in message order.
 */
export function assertionRowsOf(rawLog: RawLog, decoded: DecodedOppMessage): AssertionRow[] {
  const blockNumber =
      typeof rawLog.blockNumber === "string"
        ? parseInt(rawLog.blockNumber, HexRadix)
        : rawLog.blockNumber,
    logIndex = typeof rawLog.logIndex === "string" ? parseInt(rawLog.logIndex) : rawLog.logIndex
  return decoded.assertions.map((assertion, assertionIndex) => ({
    txHash: rawLog.transactionHash,
    blockNumber,
    // A stored column: an unfetched timestamp persists as null, not as a missing key.
    blockTime: rawLog.blockTimestamp ?? null,
    logIndex,
    messageId: decoded.header.messageId,
    previousMessageId: decoded.header.previousMessageId,
    messageTimestamp: decoded.header.timestamp,
    assertionIndex,
    assertionType: assertion.assertionType,
    args: assertion.args
  }))
}

/**
 * Decode every `OPPMessage` of `oppAddress` among `logs` into assertion rows, in input order.
 *
 * @param logs - The logs; anything that is not an `OPPMessage` of the contract is skipped.
 * @param oppAddress - The OPP contract.
 * @param warn - Where a decode failure is reported.
 * @returns Every decoded assertion, positioned.
 */
export function decodeLogsToRows(
  logs: readonly RawLog[],
  oppAddress: string,
  warn: OppWarn = defaultWarn
): AssertionRow[] {
  return logs.flatMap(rawLog => {
    const decoded = decodeOppLog(rawLog, oppAddress, warn)
    return decoded ? assertionRowsOf(rawLog, decoded) : []
  })
}

import { AbiCoder, getBytes, hexlify, zeroPadValue } from "ethers"

import {
  OppArgumentType,
  OppAssertionSchemas,
  OppAssertionType,
  OppConstants,
  isOppAssertionType,
  type RawLog
} from "@wireio/opp-snapshot"

/** The contract every fixture log is emitted by. */
export const OppAddress = "0x5e1135cf8987268a3e7f68551558ae92c454429f"

/** One assertion to encode: its type tag and argument values (bigints, or 0x-hex for addresses and bytes32). */
export interface FixtureAssertion {
  /** The assertion's tag; any number, so unknown tags can be encoded too. */
  type: OppAssertionType | number
  /** The values, by argument name. */
  values: Record<string, bigint | string>
}

/** Where a fixture log sits. */
export interface FixturePosition {
  /** The block. */
  blockNumber: number
  /** The log index within the block. */
  logIndex: number
  /** The transaction. */
  transactionHash: string
}

/** A LEB128 `varuint32`. */
function varuint(value: number): Uint8Array {
  const bytes: number[] = []
  let remaining = value
  do {
    const low = remaining & 0x7f
    remaining >>>= 7
    bytes.push(remaining ? low | 0x80 : low)
  } while (remaining)
  return Uint8Array.from(bytes)
}

/** Little-endian `uint32` words, least significant first. */
function packedWords(value: bigint, words: number): Uint8Array {
  const buffer = Buffer.alloc(words * 4)
  Array.from({ length: words }).forEach((_, index) =>
    buffer.writeUInt32LE(Number((value >> BigInt(32 * index)) & 0xffffffffn), index * 4)
  )
  return buffer
}

/** One value in its packed encoding. */
function packValue(type: OppArgumentType, value: bigint | string): Uint8Array {
  const bytes =
    type === OppArgumentType.address || type === OppArgumentType.bytes32
      ? getBytes(value as string)
      : null
  return bytes
    ? Buffer.concat([varuint(bytes.length), bytes])
    : packedWords(value as bigint, type === OppArgumentType.uint256 ? 8 : 2)
}

/** An assertion's packed payload, laid out by its type's schema; an unknown tag borrows the `Stake` layout. */
export function packAssertion(assertion: FixtureAssertion): Uint8Array {
  const layout = isOppAssertionType(assertion.type) ? assertion.type : OppAssertionType.Stake
  return Buffer.concat(
    OppAssertionSchemas[layout].arguments.map(argument =>
      packValue(argument.type, assertion.values[argument.name])
    )
  )
}

/** The ABI-encoded `OPPMessage` data carrying the assertions. */
export function encodeMessage(assertions: FixtureAssertion[], messageId = zeroPadValue("0x01", 32)): string {
  return AbiCoder.defaultAbiCoder().encode(
    ["tuple(bytes32,bytes32,bytes32,uint64)", "tuple(uint8,uint8,tuple(uint16,bytes)[])"],
    [
      [messageId, zeroPadValue("0x02", 32), zeroPadValue("0x03", 32), 1_700_000_000n],
      [1, 0, assertions.map(assertion => [assertion.type, hexlify(packAssertion(assertion))])]
    ]
  )
}

/** A raw `OPPMessage` log of {@link OppAddress} carrying the assertions. */
export function oppLog(assertions: FixtureAssertion[], position: FixturePosition): RawLog {
  return {
    address: OppAddress,
    topics: [OppConstants.OppMessageTopic0],
    data: encodeMessage(assertions),
    ...position
  }
}

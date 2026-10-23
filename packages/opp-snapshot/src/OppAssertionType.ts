/** The assertion types the pre-launch OPP contract emits: the `uint16` tag on each assertion. */
export enum OppAssertionType {
  BondedActor = 2001,
  UnbondedActor = 2002,
  Stake = 3001,
  Unstake = 3002,
  LiqPretokenPurchase = 3004,
  PretokenPurchase = 3005,
  YieldPretokenPurchase = 3006
}

/** The packed encodings an assertion argument is written in. */
export enum OppArgumentType {
  address = "address",
  uint256 = "uint256",
  bytes32 = "bytes32",
  uint64 = "uint64"
}

/** One argument of an assertion: its name and its packed encoding. */
export interface OppArgumentSchema {
  /** The key the decoded value is stored under. */
  readonly name: string
  /** How the value is packed. */
  readonly type: OppArgumentType
}

/** The layout of one assertion type's payload. */
export interface OppAssertionSchema {
  /** A human-readable name. */
  readonly name: string
  /** The arguments, in the order they are packed. */
  readonly arguments: readonly OppArgumentSchema[]
}

/** The payload layout of every assertion type the decoder understands. */
export const OppAssertionSchemas: Readonly<Record<OppAssertionType, OppAssertionSchema>> = {
  [OppAssertionType.BondedActor]: {
    name: "Bonded Actor",
    arguments: [
      { name: "actor", type: OppArgumentType.address },
      { name: "owner", type: OppArgumentType.address },
      { name: "bondLevelId", type: OppArgumentType.bytes32 },
      { name: "tokenId", type: OppArgumentType.uint256 },
      { name: "bondedAt", type: OppArgumentType.uint64 }
    ]
  },
  [OppAssertionType.UnbondedActor]: {
    name: "Unbonded Actor",
    arguments: [
      { name: "actor", type: OppArgumentType.address },
      { name: "bondLevelId", type: OppArgumentType.bytes32 },
      { name: "tokenId", type: OppArgumentType.uint256 },
      { name: "unbondedAt", type: OppArgumentType.uint64 }
    ]
  },
  [OppAssertionType.Stake]: {
    name: "Stake",
    arguments: [
      { name: "staker", type: OppArgumentType.address },
      { name: "principal", type: OppArgumentType.uint256 },
      { name: "shares", type: OppArgumentType.uint256 },
      { name: "index", type: OppArgumentType.uint256 }
    ]
  },
  [OppAssertionType.Unstake]: {
    name: "Unstake",
    arguments: [
      { name: "staker", type: OppArgumentType.address },
      { name: "amount", type: OppArgumentType.uint256 },
      { name: "shares", type: OppArgumentType.uint256 },
      { name: "index", type: OppArgumentType.uint256 },
      { name: "tokenId", type: OppArgumentType.uint256 }
    ]
  },
  [OppAssertionType.LiqPretokenPurchase]: {
    name: "Liq Pretoken Purchase",
    arguments: [
      { name: "purchaser", type: OppArgumentType.address },
      { name: "principal", type: OppArgumentType.uint256 },
      { name: "shares", type: OppArgumentType.uint256 },
      { name: "index", type: OppArgumentType.uint256 }
    ]
  },
  [OppAssertionType.PretokenPurchase]: {
    name: "Pretoken Purchase",
    arguments: [
      { name: "buyer", type: OppArgumentType.address },
      { name: "ethIn", type: OppArgumentType.uint256 },
      { name: "usdValue", type: OppArgumentType.uint256 },
      { name: "pretokensOut", type: OppArgumentType.uint256 }
    ]
  },
  [OppAssertionType.YieldPretokenPurchase]: {
    name: "Yield Pretoken Purchase",
    arguments: [
      { name: "purchaser", type: OppArgumentType.address },
      { name: "principal", type: OppArgumentType.uint256 },
      { name: "index", type: OppArgumentType.uint256 }
    ]
  }
}

/**
 * Whether a raw `uint16` tag is an assertion type the decoder understands.
 *
 * @param tag - The tag read from the message.
 * @returns True when {@link OppAssertionSchemas} carries a layout for it.
 */
export function isOppAssertionType(tag: number): tag is OppAssertionType {
  return Object.hasOwn(OppAssertionSchemas, tag)
}

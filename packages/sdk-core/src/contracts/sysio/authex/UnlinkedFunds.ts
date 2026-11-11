import type { APIClient } from "../../../api/Client.js"
import { Asset } from "../../../chain/Asset.js"
import { Base58 } from "../../../Base58.js"
import { KeyType } from "../../../chain/KeyType.js"
import type { PublicKeyType } from "../../../chain/PublicKey.js"
import { SlugName } from "../../../SlugName.js"
import { ethers } from "../../../EthersCompat.js"
import {
  SysioAuthexChainkind,
  type SysioDclaimUnmappedTokenType,
  type SysioSyndParkedRowType
} from "../../../types/SysioContractTypes.js"
import { canonicalExternalPublicKey } from "./Client.js"

const TablePath = "/v1/chain/get_table_rows"
const DclaimAccount = "sysio.dclaim"
const SyndAccount = "sysio.synd"
const AddressIndex = "bychainad"
const UnmappedTable = "unmapped"
const ParkedTable = "parked"
const PageSize = 16
const PrefixBits = 64n
const SlugHexWidth = 16
const ShadowPrecision = 9
const WireSymbol = "WIRE"
const ShadowSymbols = {
  [KeyType.EM]: "LIQETH",
  [KeyType.ED]: "LIQSOL"
} as const

/** External identity derived from an EM/ED key, never supplied independently. */
export interface ExternalWalletIdentity {
  publicKey: string
  address: string
  chainKind: SysioAuthexChainkind
}

/** Released funds awaiting linkage. Absent amounts mean verified absence, not a failed read. */
export interface UnlinkedFunds extends ExternalWalletIdentity {
  wire?: Asset
  liq?: Asset
}

interface KvRow<Row> {
  value: Row
}
interface KvPage<Row> {
  rows: Array<Row | KvRow<Row>>
  more: boolean
  next_key?: string
}
interface KvBounds {
  lower_bound: string
  upper_bound?: string
  index_name?: string
  limit: number
}

/** Validate the supported curve and derive its exact native identity. */
export function externalWalletIdentity(
  value: PublicKeyType
): ExternalWalletIdentity {
  const key = canonicalExternalPublicKey(value)
  if (key.type !== KeyType.EM && key.type !== KeyType.ED)
    throw new Error("External wallet requires an EM or ED public key")
  return {
    publicKey: key.toString(),
    address:
      key.type === KeyType.EM
        ? ethers.utils.computeAddress(key.data.array)
        : Base58.encode(key.data),
    chainKind:
      key.type === KeyType.EM
        ? SysioAuthexChainkind.CHAIN_KIND_EVM
        : SysioAuthexChainkind.CHAIN_KIND_SVM
  }
}

/** Unwrap deployed KV envelopes without passing their binary cursors through the classic uint64 decoder. */
function unwrap<Row>(row: Row | KvRow<Row>): Row {
  return row && typeof row === "object" && "value" in row
    ? row.value
    : (row as Row)
}

/** Query a bounded generated-row surface; RPC failures propagate to the caller. */
function readPage<Row>(
  client: APIClient,
  code: string,
  table: string,
  bounds: KvBounds
): Promise<KvPage<Row>> {
  return client.call<KvPage<Row>>({
    path: TablePath,
    params: { code, scope: code, table, json: true, ...bounds }
  })
}

/** Read unlinked imported WIRE and released shadow LIQ for one external wallet.
 * Pending syndication items and future yield are deliberately excluded. This is
 * a current-state read, not sponsorship policy, proof of ownership or a finality guarantee.
 */
export async function readUnlinkedFunds(
  client: APIClient,
  value: PublicKeyType
): Promise<UnlinkedFunds> {
  const identity = externalWalletIdentity(value),
    key = canonicalExternalPublicKey(identity.publicKey),
    nativeBytes =
      key.type === KeyType.EM
        ? ethers.utils.arrayify(identity.address)
        : key.data.array,
    nativeHex = ethers.utils.hexlify(nativeBytes).slice(2).toLowerCase(),
    symbol = ShadowSymbols[key.type as keyof typeof ShadowSymbols],
    prefix =
      (BigInt(identity.chainKind) << PrefixBits) |
      new DataView(nativeBytes.buffer, nativeBytes.byteOffset).getBigUint64(
        0,
        true
      ),
    upperBound = JSON.stringify({ [AddressIndex]: (prefix + 1n).toString() }),
    visited = new Set<string>(),
    matchesKind = (kind: number | string) =>
      Number(kind) === identity.chainKind ||
      kind === SysioAuthexChainkind[identity.chainKind],
    readWire = async (
      cursor = JSON.stringify({ [AddressIndex]: prefix.toString() })
    ): Promise<Asset | undefined> => {
      if (visited.has(cursor))
        throw new Error("Unmapped credit cursor did not advance")
      visited.add(cursor)
      const page = await readPage<SysioDclaimUnmappedTokenType>(
          client,
          DclaimAccount,
          UnmappedTable,
          {
            index_name: AddressIndex,
            lower_bound: cursor,
            upper_bound: upperBound,
            limit: PageSize
          }
        ),
        row = page.rows
          .map(unwrap)
          .find(
            candidate =>
              matchesKind(candidate.chain_kind) &&
              candidate.native_pubkey.toLowerCase() === nativeHex
          )
      if (row) {
        const amount = Asset.from(row.balance)
        if (amount.symbol.name !== WireSymbol)
          throw new Error("Unexpected unmapped credit symbol")
        return BigInt(amount.units.toString()) > 0n ? amount : undefined
      }
      if (!page.more) return undefined
      if (!page.next_key) throw new Error("Unmapped credit cursor is missing")
      return readWire(page.next_key)
    },
    escaped = Array.from(key.data.array, byte =>
      byte === 0 ? "0001" : byte.toString(16).padStart(2, "0")
    ).join(""),
    parkedKey =
      "0x" +
      SlugName.from(symbol).toString(16).padStart(SlugHexWidth, "0") +
      identity.chainKind.toString(16).padStart(SlugHexWidth, "0") +
      escaped +
      "0000",
    [wire, parked] = await Promise.all([
      readWire(),
      readPage<SysioSyndParkedRowType>(client, SyndAccount, ParkedTable, {
        lower_bound: parkedKey,
        limit: 1
      })
    ]),
    row = parked.rows.map(unwrap)[0]
  let liq: Asset | undefined
  if (
    row &&
    row.token_code === symbol &&
    matchesKind(row.chain_kind) &&
    row.pubkey.toLowerCase() === key.data.hexString.toLowerCase()
  ) {
    if (typeof row.balance === "number" && !Number.isSafeInteger(row.balance))
      throw new Error("Unsafe parked credit amount")
    if (BigInt(row.balance) > 0n)
      liq = Asset.fromUnits(String(row.balance), `${ShadowPrecision},${symbol}`)
  }
  return { ...identity, wire, liq }
}

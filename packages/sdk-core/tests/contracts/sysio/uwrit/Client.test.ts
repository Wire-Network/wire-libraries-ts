import { contracts, SlugName } from "@wireio/sdk-core"
import {
  SysioUwritChainkind,
  SysioUwritUnderwriterequeststatus
} from "@wireio/sdk-core/types/SysioContractTypes"

const {
  UnderwritingClient,
  WIRE_SWAP_ENDPOINT,
  normalizeFromWireQueue,
  normalizeUnderwritingRequest,
  swapFromWireActionData
} = contracts.sysio.uwrit

interface TableQuery {
  table: string
}

const slug = (value: string) => ({ value: String(SlugName.from(value)) })

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "7",
    type: "ATTESTATION_TYPE_SWAP_REQUEST",
    status: "UNDERWRITE_REQUEST_STATUS_PENDING",
    src_chain_code: slug("ETHEREUM"),
    src_token_code: slug("ETH"),
    src_reserve_code: slug("PRIMARY"),
    src_amount: "100",
    dst_chain_code: slug("SOLANA"),
    dst_token_code: slug("SOL"),
    dst_reserve_code: slug("PRIMARY"),
    dst_amount: "90",
    variance_tolerance_bps: 500,
    source_tx_id: "000000000000002a",
    depositor: "7412bc256355abd22d53de3a38e8995b5d4c1d1",
    commits_by: [],
    winner: "",
    committed_at_ms: "0",
    settled_at_ms: "0",
    expires_at_epoch: 12,
    attestation_inbound_data: "",
    attestation_outbound_data: "",
    ...overrides
  }
}

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "8",
    user: "alice",
    wire_amount: "5000000000",
    dst_chain_code: slug("SOLANA"),
    dst_token_code: slug("SOL"),
    dst_reserve_code: slug("PRIMARY"),
    target_amount: "80",
    variance_tolerance_bps: 500,
    recipient_kind: "CHAIN_KIND_SVM",
    recipient_addr: "1234",
    created_at_epoch: 5,
    ...overrides
  }
}

function fixture() {
  const getTableRows = jest.fn(async ({ table }: TableQuery) => ({
      rows:
        table === "uwreqs"
          ? [requestRow()]
          : table === "fwqueue"
            ? [queueRow()]
            : [
                {
                  fee_bps: 10,
                  collateral_lock_duration_ms: "60000",
                  min_fromwire_amount: "5000000000",
                  fromwire_revert_fee_bps: 25
                }
              ],
      more: false
    })),
    pushTransaction = jest.fn(async (_action: any, _options?: any) => ({
      transaction_id: "wire-swap"
    })),
    client = new UnderwritingClient({
      client: {
        v1: { chain: { get_table_rows: getTableRows } },
        pushTransaction
      } as any
    })

  return { client, getTableRows, pushTransaction }
}

describe("UnderwritingClient", () => {
  test("exposes the canonical WIRE sentinel and action data", () => {
    expect(WIRE_SWAP_ENDPOINT).toEqual({
      chainCode: "WIRE",
      tokenCode: "WIRE",
      reserveCode: "PRIMARY"
    })
    expect(
      swapFromWireActionData({
        user: "alice",
        wireAmount: 5n,
        destination: {
          chainCode: "SOLANA",
          tokenCode: "SOL",
          reserveCode: "PRIMARY"
        },
        targetAmount: 4n,
        targetToleranceBps: 500,
        recipientKind: SysioUwritChainkind.CHAIN_KIND_SVM,
        recipientAddress: "1234"
      })
    ).toMatchObject({ user: "alice", wire_amount: "5", target_amount: "4" })
  })

  test("normalizes request and WIRE queue rows", () => {
    expect(normalizeUnderwritingRequest(requestRow() as any)).toMatchObject({
      id: 7n,
      status:
        SysioUwritUnderwriterequeststatus.UNDERWRITE_REQUEST_STATUS_PENDING,
      source: { chainCode: "ETHEREUM", tokenCode: "ETH" },
      destination: { chainCode: "SOLANA", tokenCode: "SOL" },
      sourceRequestId: 42n,
      depositor: "7412bc256355abd22d53de3a38e8995b5d4c1d1"
    })
    expect(normalizeFromWireQueue(queueRow() as any)).toMatchObject({
      user: "alice",
      wireAmount: 5000000000n,
      recipientKind: SysioUwritChainkind.CHAIN_KIND_SVM
    })
  })

  test("decodes the synthetic WIRE request id and depositor account", () => {
    const row = requestRow({
      src_chain_code: slug("WIRE"),
      src_token_code: slug("WIRE"),
      src_reserve_code: slug("WIRE"),
      source_tx_id: "0700000000000080",
      depositor: "776972656e6f2e616263"
    })

    expect(normalizeUnderwritingRequest(row as any)).toMatchObject({
      sourceRequestId: 0x8000000000000007n,
      depositorAccount: "wireno.abc"
    })
  })

  test("leaves malformed protocol correlation bytes undecoded", () => {
    expect(
      normalizeUnderwritingRequest(
        requestRow({ source_tx_id: "not-hex", depositor: "not-hex" }) as any
      )
    ).toMatchObject({
      sourceRequestId: undefined,
      depositorAccount: undefined
    })
  })

  test("reads request, queue, and config state", async () => {
    const { client } = fixture()

    await expect(client.getRequest(7)).resolves.toMatchObject({ id: 7n })
    await expect(client.listFromWireQueue({ user: "alice" })).resolves.toEqual([
      expect.objectContaining({ id: 8n })
    ])
    await expect(client.getConfig()).resolves.toEqual({
      feeBps: 10,
      collateralLockDurationMs: 60000n,
      minimumFromWireAmount: 5000000000n,
      fromWireRevertFeeBps: 25
    })
  })

  test("pushes a WIRE-origin swap with user authorization", async () => {
    const { client, pushTransaction } = fixture()

    await client.pushSwapFromWire({
      user: "alice",
      wireAmount: 5000000000n,
      destination: {
        chainCode: "SOLANA",
        tokenCode: "SOL",
        reserveCode: "PRIMARY"
      },
      targetAmount: 80n,
      targetToleranceBps: 500,
      recipientKind: SysioUwritChainkind.CHAIN_KIND_SVM,
      recipientAddress: "1234"
    })

    const [action] = pushTransaction.mock.calls[0]
    expect(action.account.toString()).toBe("sysio.uwrit")
    expect(action.name.toString()).toBe("swapfromwire")
    expect(action.authorization.map(String)).toEqual(["alice@active"])
  })
})

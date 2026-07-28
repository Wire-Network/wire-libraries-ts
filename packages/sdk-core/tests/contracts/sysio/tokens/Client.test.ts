import { contracts, SlugName } from "@wireio/sdk-core"
import {
  SysioTokensChainkind,
  SysioTokensTokenkind
} from "@wireio/sdk-core/types/SysioContractTypes"

const { TokenRegistryClient, normalizeChainTokenRow, normalizeTokenRow } =
  contracts.sysio.tokens

interface TableQuery {
  table: string
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    code: { value: SlugName.from("ETH") },
    kind: "TOKEN_KIND_NATIVE",
    symbol_name: "ETH",
    description: "Ether",
    precision: 18,
    address: { kind: "CHAIN_KIND_EVM", address: "" },
    active: true,
    registered_at_ms: "10",
    activated_at_ms: "20",
    ...overrides
  }
}

function chainTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    chain_code: { value: SlugName.from("ETHEREUM") },
    token_code: { value: SlugName.from("ETH") },
    contract_addr: "0x",
    is_native: true,
    active: true,
    registered_at_ms: "30",
    activated_at_ms: "40",
    ...overrides
  }
}

function fixture() {
  const getTableRows = jest.fn(async ({ table }: TableQuery) => ({
      rows: table === "tokens" ? [tokenRow()] : [chainTokenRow()],
      more: false
    })),
    client = new TokenRegistryClient({
      client: { v1: { chain: { get_table_rows: getTableRows } } } as any
    })

  return { client, getTableRows }
}

describe("TokenRegistryClient", () => {
  test("normalizes token and chain-token rows", () => {
    expect(normalizeTokenRow(tokenRow() as any)).toMatchObject({
      code: "ETH",
      kind: SysioTokensTokenkind.TOKEN_KIND_NATIVE,
      addressKind: SysioTokensChainkind.CHAIN_KIND_EVM,
      registeredAtMs: 10n
    })
    expect(normalizeChainTokenRow(chainTokenRow() as any)).toMatchObject({
      chainCode: "ETHEREUM",
      tokenCode: "ETH",
      isNative: true,
      activatedAtMs: 40n
    })
  })

  test("normalizes packed slugs serialized as uint64 strings", () => {
    expect(
      normalizeTokenRow(
        tokenRow({ code: { value: String(SlugName.from("ETH")) } }) as any
      )
    ).toMatchObject({ code: "ETH" })
    expect(
      normalizeChainTokenRow(
        chainTokenRow({
          chain_code: { value: String(SlugName.from("ETHEREUM")) },
          token_code: { value: String(SlugName.from("ETH")) }
        }) as any
      )
    ).toMatchObject({ chainCode: "ETHEREUM", tokenCode: "ETH" })
  })

  test("joins active token metadata to chain deployments", async () => {
    const { client, getTableRows } = fixture()

    await expect(client.listAssets()).resolves.toEqual([
      expect.objectContaining({
        token: expect.objectContaining({ code: "ETH" }),
        chainToken: expect.objectContaining({ chainCode: "ETHEREUM" })
      })
    ])
    expect(getTableRows).toHaveBeenCalledWith(
      expect.objectContaining({ code: "sysio.tokens", scope: "sysio.tokens" })
    )
  })

  test("filters bindings and reads an exact asset", async () => {
    const { client } = fixture()

    await expect(
      client.listChainTokens({ chainCode: "SOLANA" })
    ).resolves.toEqual([])
    await expect(client.getAsset("ETHEREUM", "ETH")).resolves.toMatchObject({
      token: { symbol: "ETH" }
    })
    await expect(client.getAsset("ETHEREUM", "SOL")).resolves.toBeNull()
  })
})

import { contracts, SlugName } from "@wireio/sdk-core"
import { SysioChainsChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const { ChainsClient } = contracts.sysio.chains

const CHAIN_ROWS = [
  {
    code: { value: String(SlugName.from("ETHEREUM")) },
    kind: "CHAIN_KIND_EVM",
    external_chain_id: 31337,
    name: "Ethereum (anvil)",
    description: "Local EVM outpost",
    is_depot: false,
    active: true,
    registered_at_ms: "1784345978000",
    activated_at_ms: "1784345978000"
  },
  {
    code: { value: SlugName.from("SOLANA") },
    kind: SysioChainsChainkind.CHAIN_KIND_SVM,
    external_chain_id: 0,
    name: "Solana",
    description: "Local SVM outpost",
    is_depot: false,
    active: false,
    registered_at_ms: "1784345979000",
    activated_at_ms: "0"
  },
  {
    code: { value: SlugName.from("WIRE") },
    kind: "CHAIN_KIND_WIRE",
    external_chain_id: 0,
    name: "Wire",
    description: "Depot",
    is_depot: true,
    active: true,
    registered_at_ms: "1784345977000",
    activated_at_ms: "1784345977000"
  }
]

function clientFixture() {
  const getTableRows = jest.fn(async () => ({
      rows: CHAIN_ROWS,
      more: false,
      next_key: ""
    })),
    client = new ChainsClient({
      client: {
        v1: { chain: { get_table_rows: getTableRows } }
      } as any
    })

  return { client, getTableRows }
}

describe("ChainsClient", () => {
  test("normalizes active non-depot chains from generated rows", async () => {
    const { client, getTableRows } = clientFixture(),
      chains = await client.listChains({
        activeOnly: true,
        includeDepot: false
      })

    expect(chains).toHaveLength(1)
    expect(chains[0]).toMatchObject({
      code: "ETHEREUM",
      codeValue: SlugName.from("ETHEREUM"),
      kind: SysioChainsChainkind.CHAIN_KIND_EVM,
      externalChainId: 31337,
      active: true,
      isDepot: false,
      registeredAtMs: 1784345978000n
    })
    expect(getTableRows).toHaveBeenCalledWith({
      code: "sysio.chains",
      table: "chains",
      scope: "sysio.chains",
      json: true,
      limit: 500
    })
  })

  test("filters by chain kind and reads one exact chain", async () => {
    const { client } = clientFixture()

    await expect(
      client.listChains({ kind: SysioChainsChainkind.CHAIN_KIND_SVM })
    ).resolves.toEqual([
      expect.objectContaining({ code: "SOLANA", active: false })
    ])
    await expect(client.getChain("WIRE")).resolves.toEqual(
      expect.objectContaining({ code: "WIRE", isDepot: true })
    )
    await expect(client.getChain("MISSING")).resolves.toBeNull()
  })

  test("exposes the registered descriptor through the generic sysio proxy", async () => {
    const { client } = clientFixture(),
      proxy = contracts.sysio.createClient({
        client: client.client,
        name: "chains"
      }),
      result = await proxy.tables.chains.rows()

    expect(proxy.contract.toString()).toBe("sysio.chains")
    expect(result.rows).toEqual(CHAIN_ROWS)
  })

  test("creates actions with the client contract override", () => {
    const { client } = clientFixture(),
      custom = new ChainsClient({
        client: client.client,
        contract: "chain.admin"
      }),
      register = custom.createRegisterChainAction({
        registration: {
          kind: SysioChainsChainkind.CHAIN_KIND_EVM,
          code: "MONAD",
          externalChainId: 143,
          name: "Monad",
          description: "Monad EVM outpost"
        },
        authorization: ["chain.admin@active"]
      }),
      activate = custom.createActivateChainAction({
        code: "MONAD",
        authorization: ["chain.admin@active"]
      })

    expect(register.account.toString()).toBe("chain.admin")
    expect(activate.account.toString()).toBe("chain.admin")
  })
})

import { getBytes, hexlify, Network, sha256, zeroPadValue } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostClient,
  type EthereumOutpostClient,
  type EthereumOutpostClientOptions
} from "@wireio/sdk-outpost"
import {
  createEthereumImplementationCode,
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture
} from "../../Fixtures.js"

/** Create the Ethereum client through the package's only public facade. */
function createEthereumClient(
  options: EthereumOutpostClientOptions
): Promise<EthereumOutpostClient> {
  return OutpostClient.create({
    family: OutpostChainFamily.ethereum,
    options
  })
}

describe("EthereumOutpostClient", () => {
  it("verifies a profile and returns a generated contract type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile),
      client = await createEthereumClient({
        profile,
        connection: provider
      }),
      inbound = client.contract(EthereumContractName.OPPInbound)

    expect(inbound.target).toBe(
      profile.ethereum.contracts[EthereumContractName.OPPInbound].address
    )
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.keys(profile.ethereum.contracts).length * 2
    )
    expect(provider.getStorage).toHaveBeenCalledTimes(
      Object.keys(profile.ethereum.contracts).length
    )
  })

  it("keeps two deployments on the same EVM chain ID independent", async () => {
    const first = createOutpostDeploymentProfileFixture(),
      second = createOutpostDeploymentProfileFixture()
    second.wire.chainId = "d".repeat(64)
    second.id = `${second.wire.chainId}-${second.deploymentChecksum.slice(0, 12)}`
    second.ethereum.contracts[EthereumContractName.OPPInbound].address =
      "0x0000000000000000000000000000000000000999"
    const [firstClient, secondClient] = await Promise.all(
      [first, second].map(profile =>
        createEthereumClient({
          profile,
          connection: createEthereumProviderFixture(profile)
        })
      )
    )
    expect(firstClient.contract(EthereumContractName.OPPInbound).target).toBe(
      first.ethereum.contracts[EthereumContractName.OPPInbound].address
    )
    expect(secondClient.contract(EthereumContractName.OPPInbound).target).toBe(
      second.ethereum.contracts[EthereumContractName.OPPInbound].address
    )
    expect(firstClient.profile.wire.chainId).not.toBe(
      secondClient.profile.wire.chainId
    )
  })

  it("keeps existing Ethereum clients usable when BAR is not deployed", async () => {
    const profile = createOutpostDeploymentProfileFixture()
    delete profile.ethereum.contracts[EthereumContractName.BAR]
    const provider = createEthereumProviderFixture(profile),
      client = await createEthereumClient({
        profile,
        connection: provider
      })

    expect(() => client.nodeOwners).toThrow("has no BAR identity")
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.keys(profile.ethereum.contracts).length * 2
    )
  })

  it("requires an explicit verified withdrawal queue without disabling existing capabilities", async () => {
    const profile = createOutpostDeploymentProfileFixture()
    delete profile.ethereum.contracts.WithdrawalQueue
    const client = await createEthereumClient({
      profile,
      connection: createEthereumProviderFixture(profile)
    })
    expect(client.syndication).toBeDefined()
    expect(() => client.withdrawals).toThrow("no WithdrawalQueue identity")
  })

  it("rejects the wrong Ethereum chain", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getNetwork")
      .mockResolvedValue(Network.from({ chainId: 1, name: "mainnet" }))

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured proxy without bytecode", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("is not deployed")
  })

  it("rejects an implementation address mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getStorage")
      .mockResolvedValue(zeroPadValue("0x01", 32))

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("implementation mismatch")
  })

  it("rejects an implementation code mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    profile.ethereum.contracts[
      EthereumContractName.OPPInbound
    ].implementationCodeSha256 = "f".repeat(64)

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("implementation code mismatch")
  })

  it("rejects live code from another producer runtime", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      contract = profile.ethereum.contracts[EthereumContractName.OPP],
      incompatibleCodeBytes = getBytes(
        createEthereumImplementationCode(EthereumContractName.OPP)
      )
    incompatibleCodeBytes[0] ^= 1
    const incompatibleCode = hexlify(incompatibleCodeBytes),
      incompatibleCodeSha256 = sha256(incompatibleCode).slice(2)
    contract.implementationCodeSha256 = incompatibleCodeSha256
    const provider = createEthereumProviderFixture(profile),
      getCode = (provider.getCode as jest.Mock).getMockImplementation()
    jest
      .spyOn(provider, "getCode")
      .mockImplementation(async address =>
        address === contract.implementationAddress
          ? incompatibleCode
          : getCode(address)
      )

    await expect(
      createEthereumClient({ profile, connection: provider })
    ).rejects.toThrow("artifact runtime")
  })
})

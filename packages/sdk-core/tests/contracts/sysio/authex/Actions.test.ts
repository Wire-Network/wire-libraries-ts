import { arrayify } from "@ethersproject/bytes"
import { computePublicKey } from "@ethersproject/signing-key"

import { KeyType } from "@wireio/sdk-core/chain/KeyType"
import { PublicKey } from "@wireio/sdk-core/chain/PublicKey"
import { Signature } from "@wireio/sdk-core/chain/Signature"
import { contracts } from "@wireio/sdk-core"
import { SysioAuthexChainkind } from "@wireio/sdk-core/types/SysioContractTypes"

const { AuthexCreateLink, buildCreateLinkAction, createLinkActionData } =
  contracts.sysio.authex

const EVM = SysioAuthexChainkind.CHAIN_KIND_EVM,
  NONCE = 1_720_000_000_000

/** Creates deterministic valid-looking EVM action inputs. */
function actionFixture() {
  const publicKey = new PublicKey(
      KeyType.EM,
      arrayify(computePublicKey(`0x${"01".repeat(32)}`, true))
    ),
    rawSignature = new Uint8Array(65)

  rawSignature[64] = 27
  return {
    publicKey,
    signature: Signature.fromRaw(rawSignature, KeyType.EM)
  }
}

describe("AuthEx action builders", () => {
  test("normalizes generated create-link action data", () => {
    const { publicKey, signature } = actionFixture(),
      data = createLinkActionData({
        account: "alice",
        chainKind: EVM,
        publicKey,
        signature,
        nonce: NONCE
      })

    expect(data).toEqual({
      chain_kind: EVM,
      account: "alice",
      sig: signature.toString(),
      pub_key: publicKey.toString(),
      nonce: NONCE
    })
  })

  test("serializes createlink in deployed ABI field order", () => {
    const { publicKey, signature } = actionFixture(),
      action = buildCreateLinkAction({
        account: "alice",
        chainKind: EVM,
        publicKey,
        signature,
        nonce: NONCE,
        permission: "owner"
      }),
      decoded = action.decodeData(AuthexCreateLink)

    expect(action.account.toString()).toBe("sysio.authex")
    expect(action.name.toString()).toBe("createlink")
    expect(action.authorization.map(String)).toEqual(["alice@owner"])
    expect(Number(decoded.chain_kind)).toBe(EVM)
    expect(decoded.account.toString()).toBe("alice")
    expect(decoded.sig.toString()).toBe(signature.toString())
    expect(decoded.pub_key.toString()).toBe(publicKey.toString())
    expect(Number(decoded.nonce)).toBe(NONCE)
  })

  test("rejects unsupported create-link chains before serialization", () => {
    const { publicKey, signature } = actionFixture()

    expect(() =>
      createLinkActionData({
        account: "alice",
        chainKind: SysioAuthexChainkind.CHAIN_KIND_WIRE,
        publicKey,
        signature,
        nonce: NONCE
      })
    ).toThrow("supports only EVM(2) and SVM(3)")
  })
})

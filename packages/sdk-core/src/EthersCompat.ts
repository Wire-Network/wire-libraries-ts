import { BigNumber as EthersBigNumber } from "@ethersproject/bignumber"
import { arrayify, hexlify } from "@ethersproject/bytes"
import { hashMessage } from "@ethersproject/hash"
import { defaultPath, HDNode } from "@ethersproject/hdnode"
import { keccak256 } from "@ethersproject/keccak256"
import { sha256 } from "@ethersproject/sha2"
import {
  SigningKey,
  computePublicKey,
  recoverPublicKey
} from "@ethersproject/signing-key"
import { toUtf8Bytes } from "@ethersproject/strings"
import { computeAddress, recoverAddress } from "@ethersproject/transactions"

/** Derive the default Ethereum account from a mnemonic phrase. */
const walletFromMnemonic = (
  mnemonic: Parameters<typeof HDNode.fromMnemonic>[0]
) => HDNode.fromMnemonic(mnemonic).derivePath(defaultPath)

/** Recover the Ethereum address that signed a personal message. */
const verifyMessage = (
  message: Parameters<typeof hashMessage>[0],
  signature: Parameters<typeof recoverAddress>[1]
) => recoverAddress(hashMessage(message), signature)

/**
 * Minimal ethers v5-compatible facade used by sdk-core without importing the
 * full ethers meta-package and its provider/ws dependency tree.
 */
export const ethers = {
  BigNumber: EthersBigNumber,
  Wallet: {
    fromMnemonic: walletFromMnemonic
  },
  utils: {
    SigningKey,
    arrayify,
    computeAddress,
    computePublicKey,
    hashMessage,
    hexlify,
    keccak256,
    recoverPublicKey,
    sha256,
    toUtf8Bytes,
    verifyMessage
  }
}

export namespace ethers {
  export type BigNumber = EthersBigNumber

  export namespace providers {
    export interface JsonRpcSigner {
      signMessage(message: Uint8Array): Promise<string>
    }
  }
}

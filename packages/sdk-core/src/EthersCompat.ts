import { BigNumber as EthersBigNumber } from "@ethersproject/bignumber"
import { arrayify, hexlify } from "@ethersproject/bytes"
import { hashMessage } from "@ethersproject/hash"
import { keccak256 } from "@ethersproject/keccak256"
import { sha256 } from "@ethersproject/sha2"
import {
  SigningKey,
  computePublicKey,
  recoverPublicKey
} from "@ethersproject/signing-key"
import { toUtf8Bytes } from "@ethersproject/strings"
import { computeAddress } from "@ethersproject/transactions"
import { Wallet, verifyMessage } from "@ethersproject/wallet"

/**
 * Minimal ethers v5-compatible facade used by sdk-core without importing the
 * full ethers meta-package and its provider/ws dependency tree.
 */
export const ethers = {
  BigNumber: EthersBigNumber,
  Wallet,
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

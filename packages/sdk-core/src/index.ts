// system contract types
export * from "./types/index.js"

// chain types
export * from "./chain/index.js"

// utils
export * from "./serializer/index.js"
export * from "./Base58.js"
export * from "./SlugName.js"
export * from "./Utils.js"

// api
export * from "./api/Client.js"
export * from "./api/Provider.js"
export * as API from "./api/Types.js"

// p2p
export * from "./p2p/Client.js"
export * from "./p2p/Provider.js"
export * as P2P from "./p2p/Types.js"

// common
export * from "./common/CommonModule.js"

// resources
export * from "./resources/IndexResources.js"

// system contracts
export * as contracts from "./contracts/index.js"

// crypto
export * as Crypto from "./crypto/index.js"

export * from "./signing/IndexSigning.js"
export * from "./AbiCache.js"

// hash
import hashjs from "hash.js"
import type {
  sha256 as Sha256,
  sha512 as Sha512,
  sha384 as Sha384
} from "hash.js"

/** Keep the public constructor types independent of synthetic default imports. */
const sha256: typeof Sha256 = hashjs.sha256,
  sha512: typeof Sha512 = hashjs.sha512,
  sha384: typeof Sha384 = hashjs.sha384
export const Hash = {
  sha256,
  sha512,
  sha384
}

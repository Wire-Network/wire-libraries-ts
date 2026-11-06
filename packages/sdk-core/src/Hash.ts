import hashjs from "hash.js"

/** Hash constructors supported by the SDK. */
export const Hash = {
  sha256: hashjs.sha256,
  sha512: hashjs.sha512,
  sha384: hashjs.sha384
}

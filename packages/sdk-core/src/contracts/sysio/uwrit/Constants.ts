/** Default account hosting the underwriting coordinator. */
export const DEFAULT_UWRIT_CONTRACT = "sysio.uwrit"

/** Default maximum rows returned from underwriting tables. */
export const DEFAULT_UWRIT_QUERY_LIMIT = 500

/** Canonical WIRE endpoint used by reserve quotes and underwriting requests. */
export const WIRE_SWAP_ENDPOINT = Object.freeze({
  chainCode: "WIRE",
  tokenCode: "WIRE",
  reserveCode: "PRIMARY"
})

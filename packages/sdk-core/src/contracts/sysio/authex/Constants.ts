/** Default account that hosts the Wire AuthEx contract. */
export const DEFAULT_AUTHEX_CONTRACT = "sysio.authex"

/** Named KV index for account-scoped AuthEx link reads. */
export const AUTHEX_LINKS_BY_NAME_INDEX = "byname"

/** Named KV index for external-public-key AuthEx link reads. */
export const AUTHEX_LINKS_BY_PUBLIC_KEY_INDEX = "bypubkey"

/** Fixed suffix appended to the user-signed AuthEx create-link message. */
export const AUTHEX_CREATE_LINK_AUTH_SUFFIX = "createlink auth"

/** Lowest printable ASCII byte used by the SVM create-link digest mapping. */
export const SOLANA_DIGEST_PRINTABLE_MIN = 33

/** Number of printable ASCII values used by the SVM create-link digest mapping. */
export const SOLANA_DIGEST_PRINTABLE_RANGE = 94

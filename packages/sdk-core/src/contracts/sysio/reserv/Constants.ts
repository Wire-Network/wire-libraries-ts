/** Default account that hosts the Wire reserve registry. */
export const DEFAULT_RESERV_CONTRACT = "sysio.reserv"

/** Rows requested per page while scanning the v6 KV reserve table. */
export const DEFAULT_RESERVE_QUERY_LIMIT = 500

/** Symmetric constant-product connector weight. */
export const DEFAULT_CONNECTOR_WEIGHT_BPS = 5000

/** Lowest valid connector weight accepted by `sysio.reserv`. */
export const MIN_CONNECTOR_WEIGHT_BPS = 1

/** Highest valid connector weight accepted by `sysio.reserv`. */
export const MAX_CONNECTOR_WEIGHT_BPS = 9999

/** Fixed decimal precision of the WIRE side of every reserve. */
export const WIRE_RESERVE_PRECISION = 9

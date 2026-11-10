/**
 * Block timestamp epoch: January 1, 2025 00:00:00 UTC (in milliseconds).
 * This must match the epoch used by wire-sysio.
 */
export const BLOCK_TIMESTAMP_EPOCH_MS = 1735689600000

/**
 * Block timestamp interval in milliseconds (0.5 seconds).
 */
export const BLOCK_TIMESTAMP_INTERVAL_MS = 500

/**
 * Permission name that marks its actor as the payer of an action's CPU and NET
 * when it is the action's first authorization. The same action must also carry a
 * real permission of that actor. Matches wire-sysio's `config::sysio_payer_name`.
 */
export const SYSIO_PAYER_NAME = "sysio.payer"

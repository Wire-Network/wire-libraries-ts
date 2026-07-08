/** Maximum byte length for a uint32 varuint. */
export const VARUINT32_MAX_BYTES = 5

/** Bit width of values encoded by ABI varuint32. */
export const VARUINT32_MAX_BITS = 32

/** Number of payload bits carried in each varuint byte. */
export const VARUINT32_PAYLOAD_BITS = 7

/** Continuation flag bit in each varuint byte. */
export const VARUINT32_CONTINUATION_BIT = 0x80

/** Payload mask for each varuint byte. */
export const VARUINT32_PAYLOAD_MASK = 0x7f

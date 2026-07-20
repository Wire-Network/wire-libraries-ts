import { UInt64 } from "../../../chain/Integer.js"
import { Name } from "../../../chain/Name.js"
import { Struct } from "../../../chain/Struct.js"

/** Runtime serializer for the Wire `slug_name` wrapper used by `sysio.reserv`. */
@Struct.type("slug_name")
export class ReservSlugName extends Struct {
  /** Packed eight-character reserve slug. */
  @Struct.field("uint64") declare value: UInt64
}

/** Runtime serializer for `sysio.reserv::matchreserve`. */
@Struct.type("matchreserve")
export class ReservMatchReserve extends Struct {
  /** Source outpost chain code. */
  @Struct.field(ReservSlugName) declare chain_code: ReservSlugName

  /** Source asset token code. */
  @Struct.field(ReservSlugName) declare token_code: ReservSlugName

  /** Reserve discriminator code. */
  @Struct.field(ReservSlugName) declare reserve_code: ReservSlugName

  /** AuthEx-linked Wire account funding the WIRE side. */
  @Struct.field("name") declare matcher: Name

  /** Exact WIRE base-unit amount requested by the pending reserve. */
  @Struct.field("uint64") declare wire_amount: UInt64
}

/** Runtime serializer for read-only `sysio.reserv::swapquote`. */
@Struct.type("swapquote")
export class ReservSwapQuote extends Struct {
  /** Source chain code. */
  @Struct.field(ReservSlugName) declare from_chain_code: ReservSlugName

  /** Source token code. */
  @Struct.field(ReservSlugName) declare from_token_code: ReservSlugName

  /** Source reserve code. */
  @Struct.field(ReservSlugName) declare from_reserve_code: ReservSlugName

  /** Source amount in source-token base units. */
  @Struct.field("uint64") declare from_amount: UInt64

  /** Destination chain code. */
  @Struct.field(ReservSlugName) declare to_chain_code: ReservSlugName

  /** Destination token code. */
  @Struct.field(ReservSlugName) declare to_token_code: ReservSlugName

  /** Destination reserve code. */
  @Struct.field(ReservSlugName) declare to_reserve_code: ReservSlugName
}

/** Runtime serializer for read-only `sysio.reserv::rewardbal`. */
@Struct.type("rewardbal")
export class ReservRewardBalance extends Struct {}

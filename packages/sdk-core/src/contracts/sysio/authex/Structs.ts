import { Int32, UInt64 } from "../../../chain/Integer.js"
import { Name } from "../../../chain/Name.js"
import { PublicKey } from "../../../chain/PublicKey.js"
import { Signature } from "../../../chain/Signature.js"
import { Struct } from "../../../chain/Struct.js"

/** Runtime serializer for `sysio.authex::createlink`. */
@Struct.type("createlink")
export class AuthexCreateLink extends Struct {
  /** External chain identifier from `sysio.authex::ChainKind`. */
  @Struct.field("int32") declare chain_kind: Int32

  /** Wire account name being linked to the external key. */
  @Struct.field("name") declare account: Name

  /** External-wallet proof signature in Wire signature format. */
  @Struct.field(Signature) declare sig: Signature

  /** External chain public key in Wire public-key format. */
  @Struct.field(PublicKey) declare pub_key: PublicKey

  /** Millisecond nonce used by the contract freshness check. */
  @Struct.field("uint64") declare nonce: UInt64
}

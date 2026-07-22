import { Int32, UInt32, UInt64 } from "../../../chain/Integer.js"
import { Struct } from "../../../chain/Struct.js"

/** Runtime serializer for the Wire `slug_name` wrapper used by `sysio.chains`. */
@Struct.type("slug_name")
export class ChainsSlugName extends Struct {
  /** Packed eight-character chain code. */
  @Struct.field("uint64") declare value: UInt64
}

/** Runtime serializer for `sysio.chains::regchain`. */
@Struct.type("regchain")
export class ChainsRegisterChain extends Struct {
  /** VM/signing family from `ChainKind`. */
  @Struct.field("int32") declare kind: Int32

  /** Stable protocol chain code. */
  @Struct.field(ChainsSlugName) declare code: ChainsSlugName

  /** External numeric chain identifier. */
  @Struct.field("uint32") declare external_chain_id: UInt32

  /** Human-readable chain name. */
  @Struct.field("string") declare name: string

  /** Human-readable chain description. */
  @Struct.field("string") declare description: string
}

/** Runtime serializer for `sysio.chains::activchain`. */
@Struct.type("activchain")
export class ChainsActivateChain extends Struct {
  /** Stable protocol chain code to activate. */
  @Struct.field(ChainsSlugName) declare code: ChainsSlugName
}

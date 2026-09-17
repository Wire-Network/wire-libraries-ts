import { Int32, UInt32, UInt64 } from "../../../chain/Integer.js"
import { Struct } from "../../../chain/Struct.js"

/** Runtime serializer for the Wire `slug_name` wrapper used by `sysio.chains`. */
@Struct.type("slug_name")
export class ChainsSlugName extends Struct {
  /** Packed eight-character chain code. */
  @Struct.field("uint64") declare value: UInt64
}

/**
 * Runtime serializer for the nested `outpost_addrs` struct.
 *
 * An EVM outpost names a distinct contract per role; an SVM outpost is one
 * program named by `opp_addr`, and `sysio.chains` requires the role fields to be
 * empty for it. A chain may also be registered before its remote contracts
 * exist, leaving every field empty until `setoutpost` fills them in.
 */
@Struct.type("outpost_addrs")
export class ChainsOutpostAddrs extends Struct {
  /** EVM: the OPP contract. SVM: the outpost program id. */
  @Struct.field("string") declare opp_addr: string

  /** EVM: the OPPInbound contract. Empty for SVM. */
  @Struct.field("string") declare opp_inbound_addr: string

  /** EVM: the OperatorRegistry contract. Empty for SVM. */
  @Struct.field("string") declare operator_registry_addr: string

  /** EVM: the source swap-deposit contract. Empty for SVM. */
  @Struct.field("string") declare source_deposit_addr: string
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

  /** Remote outpost contract identities for this chain. */
  @Struct.field(ChainsOutpostAddrs) declare outpost: ChainsOutpostAddrs
}

/** Runtime serializer for `sysio.chains::setoutpost`. */
@Struct.type("setoutpost")
export class ChainsSetOutpost extends Struct {
  /** Stable protocol chain code whose deployment is being replaced. */
  @Struct.field(ChainsSlugName) declare code: ChainsSlugName

  /** Replacement remote contract identities. The whole set is replaced. */
  @Struct.field(ChainsOutpostAddrs) declare outpost: ChainsOutpostAddrs
}

/** Runtime serializer for `sysio.chains::activchain`. */
@Struct.type("activchain")
export class ChainsActivateChain extends Struct {
  /** Stable protocol chain code to activate. */
  @Struct.field(ChainsSlugName) declare code: ChainsSlugName
}

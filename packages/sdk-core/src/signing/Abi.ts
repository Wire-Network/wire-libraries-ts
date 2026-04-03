/** SigningRequest ABI and typedefs. */

import { Action } from "../chain/Action.js"
import { Bytes } from "../chain/Bytes.js"
import { Name } from "../chain/Name.js"
import { PermissionLevel } from "../chain/PermissionLevel.js"
import { Signature } from "../chain/Signature.js"
import { Struct } from "../chain/Struct.js"
import { Transaction } from "../chain/Transaction.js"
import { TypeAlias } from "../chain/TypeAlias.js"
import { UInt8 } from "../chain/Integer.js"
import { Variant } from "../chain/Variant.js"

import { ChainIdVariant } from "./ChainId.js"

@TypeAlias("account_name")
export class AccountName extends Name {}

@TypeAlias("permission_name")
export class PermissionName extends Name {}

@Struct.type("identity")
export class IdentityV2 extends Struct {
  @Struct.field(PermissionLevel, { optional: true })
  permission?: PermissionLevel
}

@Struct.type("identity")
export class IdentityV3 extends Struct {
  @Struct.field("name") declare scope: Name
  @Struct.field(PermissionLevel, { optional: true })
  permission?: PermissionLevel
}

@Variant.type("variant_req", [
  Action,
  { type: Action, array: true },
  Transaction,
  IdentityV2
])
export class RequestVariantV2 extends Variant {
  declare value: Action | Action[] | Transaction | IdentityV2
}

@Variant.type("variant_req", [
  Action,
  { type: Action, array: true },
  Transaction,
  IdentityV3
])
export class RequestVariantV3 extends Variant {
  declare value: Action | Action[] | Transaction | IdentityV3
}

@TypeAlias("request_flags")
export class RequestFlags extends UInt8 {
  static broadcast = 1 << 0
  static background = 1 << 1

  get broadcast() {
    return (Number(this) & RequestFlags.broadcast) !== 0
  }
  set broadcast(enabled: boolean) {
    this.setFlag(RequestFlags.broadcast, enabled)
  }

  get background() {
    return (Number(this) & RequestFlags.background) !== 0
  }
  set background(enabled: boolean) {
    this.setFlag(RequestFlags.background, enabled)
  }

  private setFlag(flag: number, enabled: boolean) {
    if (enabled) {
      // TODO: implement bitwise operators in core, bn.js setbit does not work
      this.value = UInt8.from(Number(this) | flag).value
    } else {
      this.value = UInt8.from(Number(this) & ~flag).value
    }
  }
}

@Struct.type("info_pair")
export class InfoPair extends Struct {
  @Struct.field("string") declare key: string
  @Struct.field("bytes") declare value: Bytes
}

@Struct.type("signing_request")
export class RequestDataV2 extends Struct {
  @Struct.field(ChainIdVariant) declare chain_id: ChainIdVariant
  @Struct.field(RequestVariantV2) declare req: RequestVariantV2
  @Struct.field(RequestFlags) declare flags: RequestFlags
  @Struct.field("string") declare callback: string
  @Struct.field(InfoPair, { array: true }) declare info: InfoPair[]
}

@Struct.type("signing_request")
export class RequestDataV3 extends Struct {
  @Struct.field(ChainIdVariant) declare chain_id: ChainIdVariant
  @Struct.field(RequestVariantV3) declare req: RequestVariantV3
  @Struct.field(RequestFlags) declare flags: RequestFlags
  @Struct.field("string") declare callback: string
  @Struct.field(InfoPair, { array: true }) declare info: InfoPair[]
}

@Struct.type("request_signature")
export class RequestSignature extends Struct {
  @Struct.field("name") declare signer: Name
  @Struct.field("signature") declare signature: Signature
}

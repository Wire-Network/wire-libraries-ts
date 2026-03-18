import { UInt16, UInt16Type, UInt32, UInt32Type } from "./Integer"
import { PermissionLevel, PermissionLevelType } from "./PermissionLevel"
import { PublicKey, PublicKeyType } from "./PublicKey"
import { Struct } from "./Struct"
import { TypeAlias } from "./TypeAlias"
import { isInstanceOf } from "../Utils"

@TypeAlias("weight_type")
export class Weight extends UInt16 {}

@Struct.type("key_weight")
export class KeyWeight extends Struct {
  @Struct.field(PublicKey) declare key: PublicKey
  @Struct.field(Weight) declare weight: Weight
}

@Struct.type("permission_level_weight")
export class PermissionLevelWeight extends Struct {
  @Struct.field(PermissionLevel) declare permission: PermissionLevel
  @Struct.field(Weight) declare weight: Weight
}

export type AuthorityType =
  | Authority
  | {
      threshold: UInt32Type
      keys?: { key: PublicKeyType; weight: UInt16Type }[]
      accounts?: { permission: PermissionLevelType; weight: UInt16Type }[]
    }

@Struct.type("authority")
export class Authority extends Struct {
  @Struct.field(UInt32) declare threshold: UInt32
  @Struct.field(KeyWeight, { array: true }) declare keys: KeyWeight[]
  @Struct.field(PermissionLevelWeight, { array: true })
  declare accounts: PermissionLevelWeight[]

  static from(value: AuthorityType): Authority {
    if (isInstanceOf(value, Authority)) {
      return value
    }

    const rv = super.from({
      keys: [],
      accounts: [],
      ...value
    }) as Authority
    rv.sort()
    return rv
  }

  /** Weight a key needs to sign for this authority. */
  get keyThreshold(): number {
    return this.threshold.toNumber()
  }

  /** Return the weight for given public key, or zero if it is not included in this authority. */
  keyWeight(publicKey: PublicKeyType): number {
    const weight = this.keys.find(({ key }) => key.equals(publicKey))
    return weight ? weight.weight.toNumber() : 0
  }

  /**
   * Check if given public key has permission in this authority,
   * @attention Does not take indirect permissions for the key via account weights into account.
   * @param publicKey The key to check.
   * @param includePartial Whether to consider auths where the key is included but can't be reached alone (e.g. multisig).
   */
  hasPermission(publicKey: PublicKeyType, includePartial = false): boolean {
    const threshold = includePartial ? 1 : this.keyThreshold
    const weight = this.keyWeight(publicKey)
    return weight >= threshold
  }

  /**
   * Sorts the authority weights in place, should be called before including the authority in a `updateauth` action or it might be rejected.
   */
  sort() {
    this.keys.sort((a, b) => String(a.key).localeCompare(String(b.key)))
    this.accounts.sort((a, b) =>
      String(a.permission).localeCompare(String(b.permission))
    )
  }
}

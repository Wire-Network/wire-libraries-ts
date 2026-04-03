import { BNPrecision, Resources, SampleUsage } from "./IndexResources.js"

import { Asset } from "../chain/Asset.js"
import { UInt64, UInt8 } from "../chain/Integer.js"
import { Struct } from "../chain/Struct.js"

@Struct.type("rexstate")
export class REXState extends Struct {
  @Struct.field("uint8") declare version: UInt8
  @Struct.field("asset") declare total_lent: Asset
  @Struct.field("asset") declare total_unlent: Asset
  @Struct.field("asset") declare total_rent: Asset
  @Struct.field("asset") declare total_lendable: Asset
  @Struct.field("asset") declare total_rex: Asset
  @Struct.field("asset") declare namebid_proceeds: Asset
  @Struct.field("uint64") declare loan_num: UInt64

  public get reserved() {
    return Number(this.total_lent.units) / Number(this.total_lendable.units)
  }

  public get symbol() {
    return this.total_lent.symbol
  }

  public get precision() {
    return this.total_lent.symbol.precision
  }

  public get value() {
    return (
      (Number(this.total_lent.units) + Number(this.total_unlent.units)) /
      Number(this.total_rex.units)
    )
  }

  exchange(amount: Asset): Asset {
    return Asset.from(
      (amount.value * this.total_lendable.value) / this.total_rex.value,
      this.symbol
    )
  }

  price_per(sample: SampleUsage, unit = 1000): number {
    // Sample token units
    const tokens = Asset.fromUnits(10000, this.symbol)

    // Spending 1 SYS (10000 units) on REX gives this many tokens
    const bancor =
      Number(tokens.units) / (this.total_rent.value / this.total_unlent.value)

    // The ratio of the number of tokens received vs the sampled values
    const unitPrice = bancor * (Number(sample.cpu) / BNPrecision.toNumber())

    // The token units spent per unit
    const perunit = Number(tokens.units) / unitPrice

    // Multiply the per unit cost by the units requested
    const cost = perunit * unit

    // Converting to an Asset
    return cost / Math.pow(10, this.precision)
  }
}

export class REXAPI {
  constructor(private parent: Resources) {}

  async get_state() {
    const response = await this.parent.api.v1.chain.get_table_rows({
      code: "sysio",
      scope: "sysio",
      table: "rexpool",
      type: REXState
    })
    return response.rows[0]
  }
}

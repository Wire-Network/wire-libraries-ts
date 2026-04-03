import { Asset } from "../chain/Asset.js"
import { UInt32, UInt8 } from "../chain/Integer.js"
import { Struct } from "../chain/Struct.js"

import { Resources } from "./IndexResources.js"
import { PowerUpStateResourceCPU } from "./powerup/Cpu.js"
import { PowerUpStateResourceNET } from "./powerup/Net.js"

@Struct.type("powerupstate")
export class PowerUpState extends Struct {
  @Struct.field("uint8") declare version: UInt8
  @Struct.field(PowerUpStateResourceNET) declare net: PowerUpStateResourceNET
  @Struct.field(PowerUpStateResourceCPU) declare cpu: PowerUpStateResourceCPU
  @Struct.field("uint32") declare powerup_days: UInt32
  @Struct.field("asset") declare min_powerup_fee: Asset
}

export class PowerUpAPI {
  constructor(private parent: Resources) {}

  async get_state(): Promise<PowerUpState> {
    const response = await this.parent.api.v1.chain.get_table_rows({
      code: "sysio",
      scope: "",
      table: "powup.state",
      type: PowerUpState
    })
    return response.rows[0]
  }
}

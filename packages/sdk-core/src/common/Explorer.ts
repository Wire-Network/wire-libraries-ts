import { Struct } from "../chain/Struct.js"

@Struct.type("explorer_definition")
export class ExplorerDefinition extends Struct {
  @Struct.field("string") declare prefix: string
  @Struct.field("string") declare suffix: string

  public url(id: string) {
    return `${this.prefix}${id}${this.suffix}`
  }
}

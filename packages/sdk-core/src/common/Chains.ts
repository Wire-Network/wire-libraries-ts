import { Checksum256, Checksum256Type } from "../chain/Checksum"
import { Logo } from "./Logo"
import type { ChainDefinitionType, LogoType } from "./Types"

export interface ChainDefinitionArgs {
  id: Checksum256Type
  name: string
  endpoint: string
  hyperion?: string
  websocket?: string
  watchdawg?: string
  namespace: string
  coreSymbol: string
  selected?: boolean
  logo?: LogoType
}

/**
 * Holds all information for a single chain.
 */
export class ChainDefinition {
  public id: Checksum256
  public name: string
  public endpoint: string
  public hyperion?: string
  public websocket?: string
  public watchdawg?: string
  public namespace: string
  public coreSymbol: string
  public selected: boolean
  public logo?: LogoType

  constructor(data: ChainDefinitionArgs) {
    this.id = Checksum256.from(data.id)
    this.name = data.name
    this.endpoint = data.endpoint
    this.hyperion = data.hyperion
    this.websocket = data.websocket
    this.watchdawg = data.watchdawg
    this.namespace = data.namespace
    this.coreSymbol = data.coreSymbol
    this.selected = !!data.selected
    this.logo = data.logo
  }

  static from(data: ChainDefinitionArgs): ChainDefinition {
    const inst = new ChainDefinition(data)

    if (data.logo) {
      inst.logo = Logo.from(data.logo)
    }

    return inst
  }

  /**
   * If you passed a `logo`, returns a Logo instance.
   */
  public getLogo(): Logo | undefined {
    return this.logo ? Logo.from(this.logo) : undefined
  }

  /**
   * Two chains are equal if ID+endpoint match.
   */
  equals(def: ChainDefinitionType): boolean {
    const other = ChainDefinition.from(def as any)
    return this.id.equals(other.id) && this.endpoint === other.endpoint
  }
}

// ----------------------------------------------------------------------------
// built-in Wire networks
// ----------------------------------------------------------------------------

export namespace Chains {
  export const DEVNET = ChainDefinition.from({
    id: 'a53ac16673f6baf13b439d350e21dc8c37de7691ef4f287beca894dc23fdec34',
    name: 'Wire Devnet',
    endpoint: 'https://wire-sysio-chain-api.dev.wire-dev.com',
    hyperion: 'https://hyperion-wire-sysio.gitgo.app',
    namespace: 'sysio',
    coreSymbol: 'SYS',
    logo: '../assets/logos/W.png',
    selected: true
  });
}

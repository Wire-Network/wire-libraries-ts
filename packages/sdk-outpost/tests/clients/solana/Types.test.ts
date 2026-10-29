import { liqsolCoreIdl } from "@wireio/outpost-solana-artifacts"
import { liqsolCoreIdl as previousIdl } from "@wireio/outpost-solana-artifacts-v0-4-4"
import { liqsolCoreIdl as legacyIdl } from "@wireio/outpost-solana-artifacts-v0-4-2"
import {
  hasConfigurableSyndicationMinimum,
  hasSyndicationMinimum,
  hasWithdrawalNonce
} from "@wireio/sdk-outpost/clients/solana/Types"

describe("verified Solana IDL capabilities", () => {
  it("distinguishes the three real producer interfaces", () => {
    expect(hasConfigurableSyndicationMinimum(liqsolCoreIdl)).toBe(true)
    expect(hasConfigurableSyndicationMinimum(previousIdl)).toBe(false)
    expect(hasConfigurableSyndicationMinimum(legacyIdl)).toBe(false)
    expect(hasSyndicationMinimum(previousIdl)).toBe(true)
    expect(hasSyndicationMinimum(legacyIdl)).toBe(false)
    expect(hasWithdrawalNonce(liqsolCoreIdl)).toBe(true)
    expect(hasWithdrawalNonce(previousIdl)).toBe(true)
    expect(hasWithdrawalNonce(legacyIdl)).toBe(false)
  })
})

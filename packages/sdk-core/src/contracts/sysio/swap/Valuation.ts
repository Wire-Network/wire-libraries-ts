import { Asset } from "../../../chain/Asset.js"
import type { ExtendedAsset } from "../../../types/SysioContractTypes.js"
import { accruedPoolYield, poolAsset, units } from "./Pool.js"
import { PoolPriceSource } from "./PricingTypes.js"
import type {
  PoolAssetValuation,
  PoolTokenPrice,
  PoolValuation,
  PoolValuationOptions
} from "./PricingTypes.js"
import {
  poolAmounts,
  priceDecimal,
  PriceDecimalScale,
  priceUnits
} from "./PriceMath.js"
import type { PriceRatio } from "./PriceMath.js"

/** Match the full extended symbol; a familiar symbol on another contract is not a price anchor. */
function matchesReference(price: PoolTokenPrice, leg: ExtendedAsset): boolean {
  return (
    price.token.contract === leg.contract &&
    Asset.Symbol.from(price.token.sym).equals(Asset.from(leg.quantity).symbol)
  )
}

/** Value one leg with no intermediate decimal rounding. */
function valueLeg(
  reserve: ExtendedAsset,
  amount: bigint,
  scale: bigint,
  price: PriceRatio,
  priceSource: PoolPriceSource
): PoolAssetValuation {
  return {
    reserve,
    priceUsd: priceDecimal(price.numerator, price.denominator),
    valueUsd: priceDecimal(price.numerator * amount, price.denominator * scale),
    priceSource
  }
}

/**
 * Value a depot pool from its coherent snapshot and one or two explicit USD references.
 * One reference infers the other price at the yield-adjusted reserve ratio. Two
 * references value both legs independently, useful with an application's selected
 * WIRE price. No price feed, network selection, polling, transaction or peg is implied.
 * Outputs are indicative, pre-fee/impact display values, floored to 18 decimals.
 */
export function getPoolValuation(options: PoolValuationOptions): PoolValuation {
  const { pool, prices } = options,
    recorded = poolAmounts(pool),
    accrued = accruedPoolYield(options),
    { first, firstScale, secondScale } = recorded,
    second = recorded.second + accrued,
    supply = Asset.from(pool.supply),
    shares = units(supply)
  if (!shares) throw new Error("LP supply must be positive")
  if (!prices.length || prices.length > 2)
    throw new Error("Supply one or two pool reference prices")
  const firstReferences = prices.filter(price =>
      matchesReference(price, pool.pool1)
    ),
    secondReferences = prices.filter(price =>
      matchesReference(price, pool.pool2)
    )
  if (firstReferences.length > 1 || secondReferences.length > 1)
    throw new Error("Duplicate pool reference price")
  if (firstReferences.length + secondReferences.length !== prices.length)
    throw new Error("Reference must match a pool contract and full symbol")

  const firstReference = firstReferences[0],
    secondReference = secondReferences[0],
    firstKnown = firstReference ? priceUnits(firstReference.usd) : 0n,
    secondKnown = secondReference ? priceUnits(secondReference.usd) : 0n,
    firstPrice: PriceRatio = firstReference
      ? { numerator: firstKnown, denominator: 1n }
      : {
          numerator: secondKnown * second * firstScale,
          denominator: first * secondScale
        },
    secondPrice: PriceRatio = secondReference
      ? { numerator: secondKnown, denominator: 1n }
      : {
          numerator: firstKnown * first * secondScale,
          denominator: second * firstScale
        },
    firstValue: PriceRatio = {
      numerator: firstPrice.numerator * first,
      denominator: firstPrice.denominator * firstScale
    },
    secondValue: PriceRatio = {
      numerator: secondPrice.numerator * second,
      denominator: secondPrice.denominator * secondScale
    },
    total: PriceRatio = {
      numerator:
        firstValue.numerator * secondValue.denominator +
        secondValue.numerator * firstValue.denominator,
      denominator: firstValue.denominator * secondValue.denominator
    }
  return {
    pool1: valueLeg(
      poolAsset(pool.pool1, first),
      first,
      firstScale,
      firstPrice,
      firstReference ? PoolPriceSource.reference : PoolPriceSource.pool
    ),
    pool2: valueLeg(
      poolAsset(pool.pool2, second),
      second,
      secondScale,
      secondPrice,
      secondReference ? PoolPriceSource.reference : PoolPriceSource.pool
    ),
    pool1InPool2: priceDecimal(
      second * firstScale * PriceDecimalScale,
      first * secondScale
    ),
    pool2InPool1: priceDecimal(
      first * secondScale * PriceDecimalScale,
      second * firstScale
    ),
    accruedYield: poolAsset(pool.pool2, accrued),
    tvlUsd: priceDecimal(total.numerator, total.denominator),
    lpTokenUsd: priceDecimal(
      total.numerator * 10n ** BigInt(supply.symbol.precision),
      total.denominator * shares
    )
  }
}

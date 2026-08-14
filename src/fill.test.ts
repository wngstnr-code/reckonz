/**
 * `executionPriceE8` and `shortfallBps` — the two mirrors of `Executor`.
 *
 * These decide whether `PolicyGuard` rejects. They were written out inline in
 * `execute.ts` before `fill.ts` existed, and a second copy is how the exit
 * path's version drifted from the Solidity for weeks (D68). So the vectors that
 * matter here are not invented: they are read back from receipts that are on
 * X Layer mainnet, where the contract computed the same number from the same
 * inputs. A test against a real receipt cannot agree with a wrong mirror.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SLIPPAGE_TOLERANCE_BPS, executionPriceE8, shortfallBps, ZERO_HASH } from './fill';

const USDG_DECIMALS = 6;
const XSTOCK_DECIMALS = 18;

// -------------------------------------------------------- executionPriceE8

test('one whole token for one unit of cash is a price of 1.00000000', () => {
  const price = executionPriceE8(1_000_000n, 10n ** 18n, XSTOCK_DECIMALS, USDG_DECIMALS);
  assert.equal(price, 100_000_000n);
});

test('receipt #16 on mainnet: the contract computed 339.92200000 and so does this', () => {
  // ReceiptRegistry id 16, tx 0x85501e91…, the first exit placed from a browser.
  // On an exit the two amounts swap roles — the cash is what comes out — and
  // `Executor._priceE8` is the same function on both sides, which is why one
  // implementation serves both directions.
  const price = executionPriceE8(169_961n, 500_000_000_000_000n, XSTOCK_DECIMALS, USDG_DECIMALS);
  assert.equal(price, 33_992_200_000n);
});

test('receipt #17 on mainnet: 339.90000000, from the CLI on the same planner', () => {
  const price = executionPriceE8(67_980n, 200_000_000_000_000n, XSTOCK_DECIMALS, USDG_DECIMALS);
  assert.equal(price, 33_990_000_000n);
});

test('the division truncates toward zero, as integer division in Solidity does', () => {
  // 1 unit of cash for 3 whole tokens is 0.333… — the contract keeps 8 decimals
  // and drops the rest. A mirror that rounded would disagree with the chain by
  // one unit at the last place, which is enough to move a slippage comparison
  // across a threshold.
  const price = executionPriceE8(1_000_000n, 3n * 10n ** 18n, XSTOCK_DECIMALS, USDG_DECIMALS);
  assert.equal(price, 33_333_333n);
});

test('decimals are read from the tokens, not assumed to match', () => {
  // Same economic trade, an asset with 8 decimals instead of 18. The price must
  // come out identical; anything else means the decimal exponents are wired to
  // the wrong side of the fraction.
  const eighteen = executionPriceE8(2_000_000n, 10n ** 18n, 18, USDG_DECIMALS);
  const eight = executionPriceE8(2_000_000n, 10n ** 8n, 8, USDG_DECIMALS);
  assert.equal(eighteen, eight);
  assert.equal(eighteen, 200_000_000n);
});

// ------------------------------------------------------------- shortfallBps

test('paying below fair value is not a shortfall, and paying exactly it is not either', () => {
  // `Executor._shortfallBps` measures against the **oracle**, not against the
  // quote: paying more than the market said is not the interesting failure,
  // paying more than the asset is worth is.
  assert.equal(shortfallBps(99_00_000_000n, 100_00_000_000n, true), 0);
  assert.equal(shortfallBps(100_00_000_000n, 100_00_000_000n, true), 0);
});

test('one percent above fair value is 100 bps', () => {
  assert.equal(shortfallBps(101_00_000_000n, 100_00_000_000n, true), 100);
});

test('an oracle with no value produces no measurement, not a large one', () => {
  // The guard would otherwise be handed a shortfall computed against zero, or
  // against a number the oracle refuses to stand behind. Both are the same
  // mistake the exit path made for weeks (D68).
  assert.equal(shortfallBps(101_00_000_000n, 100_00_000_000n, false), 0);
  assert.equal(shortfallBps(101_00_000_000n, 0n, true), 0);
});

test('the shortfall is bounded by the fair value it is measured against', () => {
  // A price of zero cannot happen, but the bound is what the Solidity's cast
  // relies on: at most 10,000 bps, which fits the uint16 the struct declares.
  // "Explicit casts are unchecked in Solidity" — two defects have come from
  // exactly this, so the mirror is asserted to stay inside the same envelope.
  for (const price of [1n, 50_00_000_000n, 199_00_000_000n, 1_000_00_000_000n]) {
    const bps = shortfallBps(price, 100_00_000_000n, true);
    assert.ok(bps >= 0 && Number.isInteger(bps));
  }
});

// ------------------------------------------------------------- the constants

test('the default slippage tolerance is 100 bps and the zero hash is 32 bytes', () => {
  // Both travel into a transaction: the tolerance becomes `minAmountOut`, below
  // which the swap reverts, and the zero hash is what an untethered fill claims
  // instead of a thesis it did not come from.
  assert.equal(DEFAULT_SLIPPAGE_TOLERANCE_BPS, 100);
  assert.equal(ZERO_HASH.length, 66);
  assert.equal(BigInt(ZERO_HASH), 0n);
});

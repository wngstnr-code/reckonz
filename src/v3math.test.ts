/**
 * Unit tests for the Uniswap V3 core math port.
 *
 * These pin arithmetic, not behaviour descriptions: every assertion here is a
 * value this module is supposed to reproduce exactly (or within the one-unit
 * rounding band the Solidity itself allows), because a silent drift in this
 * file is a silent drift in every simulated fill `pnpm plan` / `pnpm capacity`
 * report — nothing else in the repo would catch it before production.
 *
 * No network, no filesystem — pure BigInt arithmetic only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Q96,
  MIN_TICK,
  MAX_TICK,
  MIN_SQRT_RATIO,
  MAX_SQRT_RATIO,
  getSqrtRatioAtTick,
  getAmount0Delta,
  getAmount1Delta,
  getNextSqrtPriceFromInput,
  computeSwapStep,
  compressTick,
  tickBitmapPosition,
} from './v3math';

// ------------------------------------------------------- getSqrtRatioAtTick

test('getSqrtRatioAtTick(0) is exactly Q96 — 1:1 price has no rounding to hide', () => {
  assert.equal(getSqrtRatioAtTick(0), Q96);
});

test('getSqrtRatioAtTick at the tick bounds matches the published sqrt-ratio bounds', () => {
  // TickMath.MIN_SQRT_RATIO / MAX_SQRT_RATIO in the Solidity are literally
  // defined as the ratio at MIN_TICK / MAX_TICK, so this must be equality,
  // not merely "close to" — MAX_TICK in particular is often assumed to sit
  // just under MAX_SQRT_RATIO, but the constant *is* the tick's ratio.
  assert.equal(getSqrtRatioAtTick(MIN_TICK), MIN_SQRT_RATIO);
  assert.equal(getSqrtRatioAtTick(MAX_TICK), MAX_SQRT_RATIO);
});

test('getSqrtRatioAtTick(-t) is the reciprocal of getSqrtRatioAtTick(t), to within rounding', () => {
  // price(t) * price(-t) == 1 mathematically. In Q96 fixed point that means
  // a * b should land within a few parts in 1e18 of Q96^2 — the two ~1e-10
  // relative roundings the port takes (one per direction) compound, but only
  // by a negligible amount for a mid-range tick.
  for (const t of [1, 887, 12345, 500000, MAX_TICK]) {
    const a = getSqrtRatioAtTick(t);
    const b = getSqrtRatioAtTick(-t);
    const product = a * b;
    const target = Q96 * Q96;
    const diff = product > target ? product - target : target - product;
    // relative error well under 1e-9
    assert.ok(
      diff * 1_000_000_000n < target,
      `tick ${t}: relative rounding error too large (${diff} / ${target})`,
    );
  }
});

test('getSqrtRatioAtTick is strictly increasing across a spread of ticks', () => {
  const ticks = [MIN_TICK, -500000, -12345, -1, 0, 1, 12345, 500000, MAX_TICK];
  const ratios = ticks.map(getSqrtRatioAtTick);
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(
      ratios[i]! > ratios[i - 1]!,
      `ratio at tick ${ticks[i]} did not exceed ratio at tick ${ticks[i - 1]}`,
    );
  }
});

test('getSqrtRatioAtTick throws outside [MIN_TICK, MAX_TICK]', () => {
  assert.throws(() => getSqrtRatioAtTick(MAX_TICK + 1));
  assert.throws(() => getSqrtRatioAtTick(MIN_TICK - 1));
});

// -------------------------------------------------- getAmountXDelta rounding

test('getAmount0Delta round-up and round-down variants differ by at most 1, up never smaller', () => {
  const liquidity = 123_456_789_012_345n;
  const a = getSqrtRatioAtTick(1000);
  const b = getSqrtRatioAtTick(2000);

  const down = getAmount0Delta(a, b, liquidity, false);
  const up = getAmount0Delta(a, b, liquidity, true);

  assert.ok(up >= down, 'round-up variant must never be smaller than round-down');
  assert.ok(up - down <= 1n, `rounding gap should be at most 1 wei, got ${up - down}`);
});

test('getAmount1Delta round-up and round-down variants differ by at most 1, up never smaller', () => {
  const liquidity = 123_456_789_012_345n;
  const a = getSqrtRatioAtTick(1000);
  const b = getSqrtRatioAtTick(2000);

  const down = getAmount1Delta(a, b, liquidity, false);
  const up = getAmount1Delta(a, b, liquidity, true);

  assert.ok(up >= down, 'round-up variant must never be smaller than round-down');
  assert.ok(up - down <= 1n, `rounding gap should be at most 1 wei, got ${up - down}`);
});

test('getAmount0Delta / getAmount1Delta magnitude does not depend on argument order', () => {
  const liquidity = 123_456_789_012_345n;
  const a = getSqrtRatioAtTick(1000);
  const b = getSqrtRatioAtTick(2000);

  assert.equal(getAmount0Delta(a, b, liquidity, true), getAmount0Delta(b, a, liquidity, true));
  assert.equal(getAmount0Delta(a, b, liquidity, false), getAmount0Delta(b, a, liquidity, false));
  assert.equal(getAmount1Delta(a, b, liquidity, true), getAmount1Delta(b, a, liquidity, true));
  assert.equal(getAmount1Delta(a, b, liquidity, false), getAmount1Delta(b, a, liquidity, false));
});

// ------------------------------------------------- getNextSqrtPriceFromInput

test('getNextSqrtPriceFromInput moves price in the direction zeroForOne implies', () => {
  const cur = getSqrtRatioAtTick(0);
  const liquidity = 123_456_789_012_345n;

  // Selling token0 in (zeroForOne) pushes the price of token1 in terms of
  // token0 down; selling token1 in pushes it up. Getting this backwards
  // would silently invert every simulated swap's direction.
  const afterZeroForOne = getNextSqrtPriceFromInput(cur, liquidity, 1_000_000n, true);
  const afterOneForZero = getNextSqrtPriceFromInput(cur, liquidity, 1_000_000n, false);

  assert.ok(afterZeroForOne < cur, 'zeroForOne=true must decrease sqrtPriceX96');
  assert.ok(afterOneForZero > cur, 'zeroForOne=false must increase sqrtPriceX96');
});

test('getNextSqrtPriceFromInput with zero input leaves the price unchanged', () => {
  const cur = getSqrtRatioAtTick(12345);
  const liquidity = 987_654_321_000n;
  assert.equal(getNextSqrtPriceFromInput(cur, liquidity, 0n, true), cur);
  assert.equal(getNextSqrtPriceFromInput(cur, liquidity, 0n, false), cur);
});

// -------------------------------------------------------- computeSwapStep

test('computeSwapStep never consumes more than the remaining input, including the fee', () => {
  const cur = getSqrtRatioAtTick(0);
  const target = getSqrtRatioAtTick(-500);
  const liquidity = 123_456_789_012_345n;
  const remaining = 500_000n;

  const step = computeSwapStep(cur, target, liquidity, remaining, 3000);
  assert.ok(step.amountIn + step.feeAmount <= remaining);
});

test('computeSwapStep that reaches the target price consumes exactly what the target implies', () => {
  // A huge remaining amount must be capped by the target price, not by the
  // input — this is the "stops at the target rather than overshooting"
  // behaviour the exact-input walker in pool.ts depends on to terminate a
  // step at a tick boundary rather than blowing through it.
  const cur = getSqrtRatioAtTick(0);
  const target = getSqrtRatioAtTick(-500);
  const liquidity = 123_456_789_012_345n;

  const step = computeSwapStep(cur, target, liquidity, 10n ** 30n, 3000);

  assert.equal(step.sqrtRatioNextX96, target, 'huge input must stop exactly at the target price');
  // amountIn is exactly what the target price implies — the same delta the
  // no-fee SqrtPriceMath.getAmount0Delta(target, current, liquidity, true) call
  // in UniswapV3Pool.sol would return, independent of how much was offered.
  const expectedAmountIn = getAmount0Delta(target, cur, liquidity, true);
  assert.equal(step.amountIn, expectedAmountIn);
});

test('computeSwapStep with a small remaining amount stops short of the target', () => {
  const cur = getSqrtRatioAtTick(0);
  const target = getSqrtRatioAtTick(-500);
  const liquidity = 123_456_789_012_345n;

  const step = computeSwapStep(cur, target, liquidity, 500_000n, 3000);
  assert.notEqual(step.sqrtRatioNextX96, target);
  // fully spent: amountIn + feeAmount accounts for the entire remaining amount
  // once the step does not reach the target (the "not max" branch in the port).
  assert.equal(step.amountIn + step.feeAmount, 500_000n);
});

// ------------------------------------------- compressTick / tickBitmapPosition

test('compressTick floors toward negative infinity, which is not what truncation does', () => {
  // -1 / 60 truncates to 0 in every language's integer division. The correct
  // compressed tick is -1 (the tick sits in the range [-60, -1], which is the
  // *previous* multiple of the spacing below zero). Getting this wrong points
  // every negative-tick lookup at the wrong bitmap word.
  assert.equal(compressTick(-1, 60), -1);
  assert.equal(compressTick(-59, 60), -1);
  assert.equal(compressTick(-60, 60), -1); // exact multiple: no adjustment needed
  assert.equal(compressTick(-61, 60), -2);
  assert.equal(compressTick(-120, 60), -2);
});

test('compressTick on positive ticks matches simple truncation', () => {
  assert.equal(compressTick(0, 60), 0);
  assert.equal(compressTick(59, 60), 0);
  assert.equal(compressTick(60, 60), 1);
  assert.equal(compressTick(61, 60), 1);
  assert.equal(compressTick(120, 60), 2);
});

test('tickBitmapPosition places negative compressed ticks in the correct word via arithmetic shift', () => {
  // JS `>>` on negative numbers is arithmetic (sign-extending), matching
  // Solidity's int16(tick >> 8) — a naive `Math.floor(compressed / 256)` or a
  // logical shift would misplace every negative-tick word.
  assert.deepEqual(tickBitmapPosition(-1), { wordPos: -1, bitPos: 255 });
  assert.deepEqual(tickBitmapPosition(-256), { wordPos: -1, bitPos: 0 });
  assert.deepEqual(tickBitmapPosition(-257), { wordPos: -2, bitPos: 255 });
  assert.deepEqual(tickBitmapPosition(0), { wordPos: 0, bitPos: 0 });
  assert.deepEqual(tickBitmapPosition(255), { wordPos: 0, bitPos: 255 });
  assert.deepEqual(tickBitmapPosition(256), { wordPos: 1, bitPos: 0 });
});

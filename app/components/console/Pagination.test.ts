/**
 * The page bar at sizes this registry has not reached yet.
 *
 * Twenty receipts produce two pages and prove almost nothing about the thing
 * that matters here: what the bar does at four hundred. So the sequence is
 * tested directly, because the case it is built for is the one nobody can see
 * on screen today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sequence } from './Pagination';

test('every page is drawn while they still fit', () => {
  assert.deepEqual(sequence(1, 1), [1]);
  assert.deepEqual(sequence(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(sequence(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('at the start, the run fills forward and only the tail is elided', () => {
  // The reference bar: 1 2 3 4 5 … 10.
  assert.deepEqual(sequence(1, 10), [1, 2, 3, 4, 5, null, 10]);
});

test('in the middle, the current page keeps a neighbour on each side', () => {
  // No leading ellipsis: the run starts at 3, so only page 2 would be behind it
  // and a mark hiding one number is worse than the number.
  assert.deepEqual(sequence(5, 10), [1, 2, 3, 4, 5, 6, 7, null, 10]);
  assert.deepEqual(sequence(221, 442), [1, null, 219, 220, 221, 222, 223, null, 442]);
});

test('at the end, the run fills backward rather than collapsing', () => {
  assert.deepEqual(sequence(10, 10), [1, null, 6, 7, 8, 9, 10]);
});

test('an ellipsis is never drawn over a single hidden page', () => {
  // Between the run ending at 6 and a last page of 7 there is nothing to hide,
  // so the gap must be the number itself and not a dead "…".
  const bar = sequence(4, 8);
  assert.deepEqual(bar, [1, 2, 3, 4, 5, 6, 7, 8]);

  const wider = sequence(3, 9);
  assert.equal(wider.includes(null), true);
  // No gap marker may sit directly between two consecutive numbers.
  for (let i = 1; i < wider.length - 1; i += 1) {
    if (wider[i] !== null) continue;
    const before = wider[i - 1] as number;
    const after = wider[i + 1] as number;
    assert.ok(after - before > 1, `an ellipsis hides nothing between ${before} and ${after}`);
  }
});

test('the current page is always in the bar', () => {
  for (const pages of [1, 3, 8, 20, 442]) {
    for (const page of [1, 2, Math.ceil(pages / 2), pages].filter((n) => n <= pages)) {
      assert.ok(sequence(page, pages).includes(page), `page ${page} of ${pages} is missing`);
    }
  }
});

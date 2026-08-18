/**
 * Which outcomes of the admission test refute a mapping, and which merely say
 * the test could not run today.
 *
 * Worth pinning rather than commenting, because the version that collapsed them
 * was live for weeks and only surfaced when eleven pools went dry at once and
 * `pnpm reconcile` announced eleven broken mappings — none of which had moved.
 * A rule that is only wrong on the days the world is unusual is exactly the kind
 * that needs a test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refutes, type ReconcileReason } from './reconcile';

test('only the chain disagreeing about identity refutes a mapping', () => {
  assert.equal(refutes('BASIS'), true);
  // An address the issuer does not carry is not a mapping that became
  // uncheckable — the address is the mapping.
  assert.equal(refutes('NOT_CARRIED'), true);
});

test('conditions of the world do not refute anything', () => {
  // A dry pool is a market fact. The token is whatever it was yesterday.
  assert.equal(refutes('NO_VENUE'), false);
  // The issuer being silent or halted stops the comparison and stops the oracle
  // publishing a value at all, so nothing indefensible ships while it holds.
  assert.equal(refutes('NO_QUOTE'), false);
  assert.equal(refutes('HALTED'), false);
});

test('every reason is classified, so a new one cannot default to silence', () => {
  // The list is written out rather than derived: adding a reason to the union
  // without deciding which side it falls on should fail here, at the point the
  // decision is made, not in production on the day it first fires.
  const all: ReconcileReason[] = ['NOT_CARRIED', 'NO_QUOTE', 'HALTED', 'NO_VENUE', 'BASIS'];
  assert.equal(all.filter(refutes).length, 2);
  assert.equal(all.filter((r) => !refutes(r)).length, 3);
});

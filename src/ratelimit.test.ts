/**
 * The gate on the public routes.
 *
 * Every branch here decides whether a stranger can spend an LLM quota or hold
 * an RPC walker for five minutes, and two of them are the kind that look right
 * and are not: a refused caller must still accumulate their refill, and a caller
 * turned away because the instance is busy must not be charged for it. Both are
 * pinned below.
 *
 * `Date.now` is injected rather than mocked — the whole module takes `now` as an
 * argument for this reason, so the clock in a test is an argument and not a
 * global anyone else's test can trip over.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, createGate, tooMany } from './ratelimit';

const LIMIT = { burst: 3, perMinute: 6, maxInFlight: 2 };

test('the burst is what is available at once, and then it refuses', () => {
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  for (let i = 0; i < LIMIT.burst; i++) {
    const pass = gate.enter('a', t);
    assert.equal(pass.ok, true, `request ${i + 1} of the burst was refused`);
    if (pass.ok) pass.release();
  }
  const refused = gate.enter('a', t);
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.reason, 'rate');
    assert.ok(refused.retryAfterSeconds >= 1, 'a retry-after under a second is not actionable');
  }
});

test('tokens come back at the stated rate, and no faster', () => {
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const p = gate.enter('a', t);
    if (p.ok) p.release();
  }
  // 6/minute is one every 10s. At 9s there is still nothing.
  assert.equal(gate.enter('a', t + 9_000).ok, false);
  assert.equal(gate.enter('a', t + 10_001).ok, true);
});

test('the refill is capped at the burst, so idling does not bank credit', () => {
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  const first = gate.enter('a', t);
  if (first.ok) first.release();

  // An hour later: 360 tokens' worth of time, 3 tokens' worth of bucket.
  const later = t + 3_600_000;
  for (let i = 0; i < LIMIT.burst; i++) {
    const p = gate.enter('a', later);
    assert.equal(p.ok, true);
    if (p.ok) p.release();
  }
  assert.equal(gate.enter('a', later).ok, false);
});

test('hammering while refused does not reset the clock', () => {
  // The trap this test exists for: if a refusal left `updatedAt` alone, a client
  // in a retry loop would keep refilling from the original timestamp and get a
  // token early; if it stamped `updatedAt` without storing the refill, the same
  // client would never accumulate one at all and would be locked out forever.
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const p = gate.enter('a', t);
    if (p.ok) p.release();
  }
  // Refused once a second for nine seconds, then the tenth second arrives.
  for (let s = 1; s <= 9; s++) assert.equal(gate.enter('a', t + s * 1_000).ok, false);
  assert.equal(gate.enter('a', t + 10_001).ok, true, 'the retries starved the refill');
});

test('a caller turned away for concurrency is not charged a token', () => {
  // Being refused because someone else is mid-run is not this caller's doing,
  // and spending their budget for it would punish them for the instance's
  // traffic. They should be able to come straight back when a slot frees.
  const gate = createGate('test', { burst: 5, perMinute: 60, maxInFlight: 1 });
  const t = 1_000_000;

  const held = gate.enter('a', t);
  assert.equal(held.ok, true);

  const busy = gate.enter('b', t);
  assert.equal(busy.ok, false);
  if (!busy.ok) assert.equal(busy.reason, 'busy');

  if (held.ok) held.release();
  // b's bucket is untouched: all five still there.
  for (let i = 0; i < 5; i++) {
    const p = gate.enter('b', t);
    assert.equal(p.ok, true, `b was charged for the busy refusal (${i})`);
    if (p.ok) p.release();
  }
});

test('releasing twice does not hand out an extra slot', () => {
  // A stream that both errors and closes calls `release` on two paths. Without
  // the guard the counter drifts negative and the concurrency cap quietly stops
  // being one — the kind of bug that only shows up under the load it was meant
  // to bound.
  const gate = createGate('test', { burst: 10, perMinute: 600, maxInFlight: 1 });
  const t = 1_000_000;

  const p = gate.enter('a', t);
  assert.equal(p.ok, true);
  if (p.ok) {
    p.release();
    p.release();
  }
  assert.equal(gate.inspect().inFlight, 0);

  const next = gate.enter('b', t);
  assert.equal(next.ok, true);
  assert.equal(gate.enter('c', t).ok, false, 'the cap of one was exceeded');
  if (next.ok) next.release();
});

test('one caller cannot spend another caller’s budget', () => {
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const p = gate.enter('a', t);
    if (p.ok) p.release();
  }
  assert.equal(gate.enter('a', t).ok, false);
  const other = gate.enter('b', t);
  assert.equal(other.ok, true);
  if (other.ok) other.release();
});

test('idle buckets are evicted, so the map does not grow forever', () => {
  const gate = createGate('test', LIMIT);
  const t = 1_000_000;
  for (let i = 0; i < 50; i++) {
    const p = gate.enter(`caller-${i}`, t);
    if (p.ok) p.release();
  }
  assert.equal(gate.inspect().keys, 50);

  // Eleven minutes later a single request sweeps the rest away.
  const p = gate.enter('caller-0', t + 11 * 60_000);
  if (p.ok) p.release();
  assert.equal(gate.inspect().keys, 1);
});

// ------------------------------------------------------------------ the key

test('the client is the first entry of x-forwarded-for', () => {
  // Vercel's proxy appends, so the client is at the front and the hops follow.
  const request = new Request('https://reckonz.vercel.app/api/run', {
    headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' },
  });
  assert.equal(clientKey(request), '203.0.113.7');
});

test('an unidentifiable caller shares one bucket rather than getting a fresh one', () => {
  // The safe direction. A per-request key would mean no limit at all for
  // exactly the requests we know least about.
  assert.equal(clientKey(new Request('https://reckonz.vercel.app/api/run')), 'unknown');
  assert.equal(
    clientKey(
      new Request('https://reckonz.vercel.app/api/run', { headers: { 'x-real-ip': '198.51.100.4' } }),
    ),
    '198.51.100.4',
  );
});

test('the 429 carries a Retry-After a client can obey', () => {
  const gate = createGate('test', { burst: 1, perMinute: 6, maxInFlight: 5 });
  const t = 1_000_000;
  const first = gate.enter('a', t);
  if (first.ok) first.release();

  const refused = gate.enter('a', t);
  assert.equal(refused.ok, false);
  if (refused.ok) return;

  const response = tooMany(refused);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), String(refused.retryAfterSeconds));
});

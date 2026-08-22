/**
 * The heartbeat is a liveness signal, and a liveness signal that can be
 * misparsed is worse than none: `undefined` compared against a threshold reads
 * as "recent" in one direction and "ancient" in the other, and either way it is
 * an answer nobody measured. So the reader validates before it trusts, and these
 * are the shapes it has to refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heartbeatUrl, parseHeartbeat, readHeartbeat, type PublisherHeartbeat } from './publisher-status';

const GOOD: PublisherHeartbeat = {
  at: 1_787_389_051,
  target: 'mainnet',
  cycle: 'withheld',
  considered: 30,
  published: 0,
  issuer: 'closed',
  quotable: 0,
  period: 'closed',
};

test('a well-formed heartbeat survives the round trip', () => {
  assert.deepEqual(parseHeartbeat(JSON.parse(JSON.stringify(GOOD))), GOOD);
});

test('a heartbeat with no timestamp is refused, not defaulted', () => {
  // The half-written object is the realistic failure, and a missing `at` must
  // never become 0 or now — one is a permanent outage, the other a permanent
  // all-clear.
  for (const at of [undefined, null, 0, -1, 'yesterday', NaN]) {
    assert.equal(parseHeartbeat({ ...GOOD, at }), null, `at=${String(at)}`);
  }
});

test('an unknown issuer or cycle state is refused', () => {
  // These drive a diagnosis. A value this reader does not know is a value it
  // cannot classify, and guessing would put words in the publisher's mouth.
  assert.equal(parseHeartbeat({ ...GOOD, issuer: 'sleeping' }), null);
  assert.equal(parseHeartbeat({ ...GOOD, cycle: 'maybe' }), null);
});

test('non-objects are refused rather than coerced', () => {
  for (const v of [null, undefined, 42, 'ok', []]) assert.equal(parseHeartbeat(v), null);
});

test('missing counts degrade to zero, because they are not the liveness fact', () => {
  // Deliberately softer than `at`: a heartbeat that says when it ran is useful
  // even if a count is absent, and refusing the whole object over one number
  // would trade a diagnosis for a blank.
  const partial = parseHeartbeat({ at: GOOD.at, cycle: 'failed', issuer: 'unreachable' });
  assert.equal(partial?.considered, 0);
  assert.equal(partial?.target, 'unknown');
  assert.equal(partial?.period, null);
});

test('the key is fixed, so the latest word is always at one address', () => {
  assert.match(heartbeatUrl('https://example.test'), /^https:\/\/example\.test\/publisher\/heartbeat\.json$/);
});

test('a store that 404s reads as missing, never as a stopped publisher', async () => {
  // The rollout case. `missing` and `stale` are opposite conclusions and
  // `classifyHealth` treats them that way — see the `unknown` cause.
  const r = await readHeartbeat('https://example.test/nothing-here.json');
  assert.ok(r.kind === 'missing' || r.kind === 'unreadable', `got ${r.kind}`);
});

test('a body that is not a heartbeat reads as unreadable', async () => {
  const server = await import('node:http').then(({ createServer }) =>
    createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"hello":"world"}');
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as { port: number };
  try {
    const read = await readHeartbeat(`http://127.0.0.1:${port}/h.json`);
    assert.equal(read.kind, 'unreadable');
  } finally {
    server.close();
  }
});

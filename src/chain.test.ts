/**
 * The endpoint list, and the two ways it can be quietly wrong.
 *
 * No network here. Whether an endpoint works was settled by measurement (D82) —
 * each answered `eth_chainId` with the right chain and executed a real
 * `eth_call`, and failover was watched happening with a dead primary. What is
 * worth pinning in a suite is different: that the lists are wired to the right
 * chains, and that nothing has quietly turned three endpoints back into one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rpcsFor,
  xLayer,
  xLayerTestnet,
  XLAYER_RPCS,
  XLAYER_TESTNET_RPCS,
} from './chain';

test('each chain gets its own endpoints, and not the other chain’s', () => {
  // The failure this prevents is not subtle in its consequences: `walletFor`
  // builds its transport from the chain id, so crossing these would send a
  // mainnet transaction's reads to testnet, where the contracts have the same
  // addresses and different state (see the ⚠ in 05-status.md).
  assert.deepEqual(rpcsFor(196), XLAYER_RPCS);
  assert.deepEqual(rpcsFor(1952), XLAYER_TESTNET_RPCS);
  assert.notDeepEqual(rpcsFor(196), rpcsFor(1952));
});

test('an unknown chain id falls back to mainnet rather than to nothing', () => {
  // There are two chains and there will not be a third soon. An empty list
  // would be a client that cannot read anything, which is a worse answer than
  // the obvious default.
  assert.deepEqual(rpcsFor(1), XLAYER_RPCS);
});

test('every endpoint is https and appears once', () => {
  // A duplicated entry looks like redundancy and is a wasted retry against a
  // host that just failed — the fallback would burn its budget on the same
  // machine twice.
  for (const list of [XLAYER_RPCS, XLAYER_TESTNET_RPCS]) {
    assert.equal(new Set(list).size, list.length, `${list.join(', ')} contains a duplicate`);
    for (const url of list) assert.match(url, /^https:\/\//, `${url} is not https`);
  }
});

test('there is more than one of them, which is the whole point', () => {
  // Guards the regression that matters: someone deleting the extras during a
  // debugging session and leaving the product back on a single point of
  // failure. Until 2026-08-14 one outage at rpc.xlayer.tech meant no quote, no
  // capacity, no oracle read and no fill.
  assert.ok(XLAYER_RPCS.length >= 2, 'mainnet is back to a single RPC');
  assert.ok(XLAYER_TESTNET_RPCS.length >= 2, 'testnet is back to a single RPC');
});

test('the chain definitions carry the same lists as the transport', () => {
  // viem clients built from the chain rather than from `transportFor` — a wallet
  // extension's, or anything future — take their endpoints from here. If these
  // drift, half the code has failover and half does not, and which half is
  // which is invisible.
  assert.deepEqual(xLayer.rpcUrls.default.http, [...XLAYER_RPCS]);
  assert.deepEqual(xLayerTestnet.rpcUrls.default.http, [...XLAYER_TESTNET_RPCS]);
});

test('rpc.xlayer.tech stays the primary', () => {
  // Not a quality judgement — OKX's own endpoint measured faster (0.21s against
  // 0.93s). Every gas figure, latency note and receipt in this repo was taken
  // through this host, and silently switching the primary would make those
  // numbers incomparable to the ones that come after. Change it on purpose,
  // with a note, or not at all.
  assert.equal(XLAYER_RPCS[0], 'https://rpc.xlayer.tech');
  assert.equal(XLAYER_TESTNET_RPCS[0], 'https://testrpc.xlayer.tech');
});

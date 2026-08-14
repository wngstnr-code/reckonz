/**
 * Unit tests for the Permit2 authorisation builder: `unusedNonce`,
 * `buildPermit`, `describePermit`. No RPC — `unusedNonce`/`buildPermit` take
 * a hand-written fake `PublicClient` exposing only `readContract`, which is
 * the one method these functions call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Address, PublicClient } from 'viem';
import { unusedNonce, buildPermit, describePermit, PERMIT_TTL_SEC, type PermitRequest } from './permit';

const OWNER: Address = '0x1111111111111111111111111111111111111a';
const SPENDER: Address = '0x2222222222222222222222222222222222222b';
const TOKEN: Address = '0x4ae46a509f6b1d9056937ba4500cb143933d2dc8'; // USDG

/** A fake PublicClient whose `nonceBitmap` answers are supplied per word. */
function fakeClient(bitmapByWord: Map<bigint, bigint>): PublicClient {
  return {
    readContract: async ({ args }: { args: readonly unknown[] }) => {
      const [, word] = args as [Address, bigint];
      const bitmap = bitmapByWord.get(word);
      if (bitmap === undefined) throw new Error(`unexpected word ${word}`);
      return bitmap;
    },
  } as unknown as PublicClient;
}

// ----------------------------------------------------------------- unusedNonce

test('unusedNonce returns 0 when word 0 is entirely unused', async () => {
  const client = fakeClient(new Map([[0n, 0n]]));
  assert.equal(await unusedNonce(client, OWNER), 0n);
});

test('unusedNonce returns N when the first N bits of word 0 are set', async () => {
  const N = 5;
  let bitmap = 0n;
  for (let i = 0; i < N; i++) bitmap |= 1n << BigInt(i);
  const client = fakeClient(new Map([[0n, bitmap]]));
  assert.equal(await unusedNonce(client, OWNER), BigInt(N));
});

test('unusedNonce moves to the next word when the first is entirely full, returning 256', () => {
  const fullWord = (1n << 256n) - 1n;
  const client = fakeClient(
    new Map([
      [0n, fullWord],
      [1n, 0n],
    ]),
  );
  return unusedNonce(client, OWNER).then((nonce) => assert.equal(nonce, 256n));
});

test('unusedNonce throws rather than wrapping when every scanned word is full', async () => {
  // Reusing a nonce produces a signature that reverts at the worst possible
  // moment, so silently wrapping back to word 0 (or returning a bogus value)
  // would be worse than failing loudly here.
  const fullWord = (1n << 256n) - 1n;
  const bitmapByWord = new Map<bigint, bigint>();
  for (let w = 0n; w < 3n; w++) bitmapByWord.set(w, fullWord);
  const client = fakeClient(bitmapByWord);
  await assert.rejects(
    () => unusedNonce(client, OWNER, 3n),
    /no unused Permit2 nonce/,
  );
});

// ------------------------------------------------------------------ buildPermit

function baseRequest(overrides: Partial<PermitRequest> = {}): PermitRequest {
  return {
    token: TOKEN,
    amount: 1_000_000_000n,
    spender: SPENDER,
    owner: OWNER,
    chainId: 196,
    ...overrides,
  };
}

test('buildPermit puts spender in typedData.message but not in the permit calldata struct', async () => {
  const client = fakeClient(new Map([[0n, 0n]]));
  const req = baseRequest();
  const payload = await buildPermit(client, req, 1_800_000_000);

  // This asymmetry is the security property: Permit2 reconstructs `spender`
  // from `msg.sender`, so the signed message must name it and the calldata
  // struct sent to the contract must not carry a second, spoofable copy.
  assert.equal(payload.typedData.message.spender, SPENDER);
  assert.equal((payload.permit as Record<string, unknown>).spender, undefined);
  assert.deepEqual(Object.keys(payload.permit).sort(), ['deadline', 'nonce', 'permitted']);
});

test('buildPermit sets the deadline to nowSec + PERMIT_TTL_SEC exactly', async () => {
  const client = fakeClient(new Map([[0n, 0n]]));
  const nowSec = 1_800_000_000;
  const payload = await buildPermit(client, baseRequest(), nowSec);
  assert.equal(payload.deadline, BigInt(nowSec + PERMIT_TTL_SEC));
  assert.equal(payload.typedData.message.deadline, BigInt(nowSec + PERMIT_TTL_SEC));
});

test('buildPermit names exactly one token at exactly the requested amount', async () => {
  const client = fakeClient(new Map([[0n, 0n]]));
  const req = baseRequest({ amount: 42_000_000n });
  const payload = await buildPermit(client, req, 1_800_000_000);

  assert.equal(payload.permit.permitted.length, 1);
  assert.equal(payload.permit.permitted[0]!.token, TOKEN);
  assert.equal(payload.permit.permitted[0]!.amount, 42_000_000n);
  assert.deepEqual(payload.typedData.message.permitted, payload.permit.permitted);
});

test('buildPermit carries the nonce read from unusedNonce through to both typedData and permit', async () => {
  // Word 0 has bits 0..2 set, so the first free nonce is 3.
  const client = fakeClient(new Map([[0n, 0b111n]]));
  const payload = await buildPermit(client, baseRequest(), 1_800_000_000);
  assert.equal(payload.nonce, 3n);
  assert.equal(payload.permit.nonce, 3n);
  assert.equal(payload.typedData.message.nonce, 3n);
});

// --------------------------------------------------------------- describePermit

test('describePermit states the amount in human units, respecting the token decimals', () => {
  const req = baseRequest({ amount: 1_000_000n }); // USDG, 6 decimals -> 1.0
  const lines = describePermit(req, BigInt(Math.floor(Date.now() / 1000) + 600), 'USDG', 6);
  assert.ok(lines.some((l) => l.includes('1 USDG')));
});

test('describePermit formats fractional amounts correctly for the token decimals', () => {
  const req = baseRequest({ amount: 1_500_000n }); // 1.5 USDG at 6 decimals
  const lines = describePermit(req, BigInt(Math.floor(Date.now() / 1000) + 600), 'USDG', 6);
  assert.ok(lines.some((l) => l.includes('1.5 USDG')));
});

test('describePermit names the spender address', () => {
  const req = baseRequest();
  const lines = describePermit(req, BigInt(Math.floor(Date.now() / 1000) + 600), 'USDG', 6);
  assert.ok(lines.some((l) => l.includes(SPENDER)));
});

test('describePermit states the expiry in minutes from now', () => {
  const req = baseRequest();
  const nowSec = Math.floor(Date.now() / 1000);
  const lines = describePermit(req, BigInt(nowSec + 600), 'USDG', 6); // 10 minutes out
  assert.ok(lines.some((l) => /~10 minutes/.test(l)));
});

/**
 * The deadline around WalletConnect's `init`, and why it exists.
 *
 * Found by clicking the button with a wrong project id: the relay answered
 * `WebSocket connection closed abnormally with code: 3000 (Project not found)`
 * as an unhandled exception, outside the awaited promise. The header sat on
 * `connecting…` forever — no error, no way back, nothing to suggest anything
 * had happened. A promise that never settles is the worst failure a button can
 * have, because it looks like patience.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDeadline } from './useWallet';

test('a promise that settles in time passes straight through', async () => {
  assert.equal(await withDeadline(Promise.resolve('paired'), 1_000, 'too slow'), 'paired');
});

test('a rejection passes through unchanged, carrying its own message', async () => {
  // The deadline must not replace a real error with a timeout: "Project not
  // found" tells someone what to fix, "timed out" sends them looking at their
  // network.
  await assert.rejects(
    withDeadline(Promise.reject(new Error('Project not found')), 1_000, 'too slow'),
    /Project not found/,
  );
});

test('a promise that never settles is rejected with the sentence we chose', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 20, 'relay unreachable'), /relay unreachable/);
});

test('the timer is cleared on success, so nothing keeps the process alive', async () => {
  // Without `clearTimeout` a 20-second deadline holds an event-loop handle for
  // 20 seconds after a connection that already succeeded. In a browser that is
  // invisible; in this test runner it is the difference between exiting and
  // hanging, which is a useful place to notice it.
  const before = process.getActiveResourcesInfo?.().length ?? 0;
  await withDeadline(Promise.resolve(1), 20_000, 'unused');
  const after = process.getActiveResourcesInfo?.().length ?? 0;
  assert.ok(after <= before, `a timer outlived the promise (${before} -> ${after})`);
});

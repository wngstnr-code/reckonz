/**
 * The owner's kill switch, made pressable.
 *
 * `PolicyGuard.setCircuitBreaker` has existed since the guard was written and
 * its own comment calls it a kill switch — but nothing in `src/` or `app/` ever
 * called it, so the only way to stop a mandate was to hand-roll a `cast send`
 * (D52). A safety control nobody can reach in a hurry is not a safety control.
 *
 *   TARGET=mainnet pnpm breaker 3          # what state is it in?
 *   TARGET=mainnet pnpm breaker 3 on       # stop this mandate now
 *   TARGET=mainnet pnpm breaker 3 off      # release it
 *
 * **Tripping stops exits as well as entries.** That is deliberate and is pinned
 * by `test_CircuitBreakerStopsExitsToo`: a fired *trigger* must never block an
 * exit, because the mandate is telling you to leave, but a tripped *breaker* is
 * the owner saying stop everything — and an attacker who can only sell is still
 * an attacker. What makes it safe is custody: the assets are in the owner's own
 * wallet and any DEX will still trade them. The breaker stops this system, not
 * the owner.
 *
 * Owner-only on chain. This script checks that before spending gas, so the
 * failure is a sentence rather than a revert.
 */
import { type Address } from 'viem';
import { POLICY_GUARD_ABI } from './abi';
import {
  accountFrom,
  chainFor,
  deploymentFor,
  target,
  waitForReceipt,
  waitUntil,
  walletFor,
} from './wallet';

const MANDATE_ARG = process.argv[2];
const ACTION = process.argv[3]?.toLowerCase();

if (!MANDATE_ARG || !/^\d+$/.test(MANDATE_ARG)) {
  console.error('usage: TARGET=mainnet pnpm breaker <mandateId> [on|off]');
  process.exit(1);
}
if (ACTION !== undefined && ACTION !== 'on' && ACTION !== 'off') {
  console.error(`unknown action "${ACTION}" — use on, off, or omit it to just read the state`);
  process.exit(1);
}

const mandateId = BigInt(MANDATE_ARG);
const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const GUARD = deployment.contracts.PolicyGuard as Address;

const owner = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(owner, t);

console.log(`\n  PolicyGuard ${GUARD}  (${deployment.name}, chain ${chain.id})`);
console.log(`  caller      ${owner.address}\n`);

const mandate = await wallet.readContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'getMandate',
  args: [mandateId],
});

if (mandate.owner === '0x0000000000000000000000000000000000000000') {
  console.error(`  mandate #${mandateId} does not exist on this guard.\n`);
  process.exit(1);
}

console.log(`  mandate #${mandateId}`);
console.log(`    owner     ${mandate.owner}`);
console.log(`    agent     ${mandate.agent}`);
console.log(`    active    ${mandate.active}`);
console.log(`    breaker   ${mandate.circuitBreaker ? '⛔ TRIPPED — nothing can execute' : 'clear'}`);

if (ACTION === undefined) {
  console.log(`\n  Read-only. Pass "on" to trip it or "off" to release it.\n`);
  process.exit(0);
}

// Checked here so the refusal is legible. The contract enforces it regardless —
// this is convenience, not the control.
if (mandate.owner.toLowerCase() !== owner.address.toLowerCase()) {
  console.error(`\n  Only the mandate's owner can touch the breaker, and that is not you.`);
  console.error(`  owner ${mandate.owner}`);
  console.error(`  you   ${owner.address}\n`);
  process.exit(1);
}

const want = ACTION === 'on';
if (mandate.circuitBreaker === want) {
  console.log(`\n  Already ${want ? 'tripped' : 'clear'}. Nothing to do.\n`);
  process.exit(0);
}

if (want) {
  console.log(`\n  Tripping the breaker on mandate #${mandateId}.`);
  console.log(`  This stops entries AND exits through this system. Your assets stay in your`);
  console.log(`  wallet and remain sellable on any DEX — the breaker stops Reckonz acting,`);
  console.log(`  not you.`);
} else {
  console.log(`\n  Releasing the breaker on mandate #${mandateId}. The agent can propose again,`);
  console.log(`  still bounded by the policy and the exit triggers.`);
}

const hash = await wallet.writeContract({
  address: GUARD,
  abi: POLICY_GUARD_ABI,
  functionName: 'setCircuitBreaker',
  args: [mandateId, want],
});
const receipt = await waitForReceipt(wallet, hash);
console.log(`\n  tx        ${hash}  (${receipt.status}, gas ${receipt.gasUsed})`);

// A confirmed write is not immediately readable on this chain (D18), and for a
// safety control "probably tripped" is not an acceptable answer.
const confirmed = await waitUntil(
  () =>
    wallet.readContract({
      address: GUARD,
      abi: POLICY_GUARD_ABI,
      functionName: 'getMandate',
      args: [mandateId],
    }),
  (m) => m.circuitBreaker === want,
  { attempts: 30, delayMs: 500, what: 'the breaker state' },
);

console.log(
  `  breaker   ${confirmed.circuitBreaker ? '⛔ TRIPPED' : 'clear'} — confirmed by reading it back`,
);
console.log(`  explorer  ${deployment.explorer}/tx/${hash}\n`);

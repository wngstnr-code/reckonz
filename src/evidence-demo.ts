/**
 * Check a receipt against the evidence it claims.
 *
 * The hash in a receipt is only worth something if somebody can run the check.
 * This is that check, and it is deliberately the whole of it: re-derive the
 * hash from the stored bundle and compare. A bundle that no longer hashes to
 * the recorded value has been edited since the fill, and saying so is more
 * useful than any assurance that it has not.
 *
 *   pnpm evidence 0xabc…            # verify one bundle by its hash
 *   TARGET=mainnet pnpm evidence    # every receipt, against what is on disk
 */
import { evidenceHash, evidencePath, readEvidence, verifyEvidence } from './evidence';
import { RECEIPT_REGISTRY_ABI } from './abi';
import { client } from './chain';
import { MAINNET } from './deployments';

const ARG = process.argv[2] as `0x${string}` | undefined;
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';

if (ARG) {
  const bundle = await readEvidence(ARG);
  if (!bundle) {
    console.error(`\n  No bundle at ${evidencePath(ARG)}.\n`);
    process.exit(1);
  }
  const ok = verifyEvidence(bundle, ARG);
  console.log(`\n  ${evidencePath(ARG)}`);
  console.log(`  recomputed ${evidenceHash(bundle)}`);
  console.log(`  ${ok ? '✅ matches — this is the bundle the receipt refers to' : '⛔ MISMATCH — edited since the fill'}\n`);
  console.log(JSON.stringify(bundle, null, 2));
  process.exit(ok ? 0 : 1);
}

const deployment = MAINNET;
if (!deployment) {
  console.error('no mainnet deployment recorded');
  process.exit(1);
}
const REGISTRY = deployment.contracts.ReceiptRegistry as `0x${string}`;

const count = await client.readContract({
  address: REGISTRY,
  abi: RECEIPT_REGISTRY_ABI,
  functionName: 'count',
});

console.log(`\n  ReceiptRegistry ${REGISTRY} — ${count} receipts\n`);

let bound = 0;
let verified = 0;
for (let id = 0n; id < count; id++) {
  const [receipt] = await client.readContract({
    address: REGISTRY,
    abi: RECEIPT_REGISTRY_ABI,
    functionName: 'get',
    args: [id],
  });

  if (receipt.evidenceHash === ZERO) {
    // Every fill before D57 recorded a zero hash. Reported rather than skipped:
    // a run that silently listed only the bound ones would overstate how much of
    // the history can be audited.
    console.log(`  #${id}  no evidence recorded`);
    continue;
  }
  bound++;

  const bundle = await readEvidence(receipt.evidenceHash);
  if (!bundle) {
    console.log(`  #${id}  ${receipt.evidenceHash}  ⚠ hash on chain, no bundle on disk`);
    continue;
  }
  const ok = verifyEvidence(bundle, receipt.evidenceHash);
  if (ok) verified++;
  console.log(
    `  #${id}  ${receipt.evidenceHash}  ${ok ? '✅ verified' : '⛔ MISMATCH'}` +
      `  ${bundle.kind}, oracle ${bundle.observations[0]?.ageSeconds ?? '?'}s old at decision`,
  );
}

console.log(
  `\n  ${bound} of ${count} receipts carry an evidence hash; ${verified} verified against a` +
    ` bundle on disk.\n`,
);

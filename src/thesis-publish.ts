/**
 * Publish a thesis on chain, before it is traded.
 *
 * `ReceiptRegistry` already makes the executions unfalsifiable. This is the other
 * half: a record of trades proves what you did, not that you meant to. Publishing
 * the reasoning first, and stamping its hash into every fill it produces, is what
 * separates a thesis from hindsight.
 *
 * The check a sceptic runs afterwards is one comparison:
 *
 *     thesisRegistry.get(id).publishedAt  <  receiptRegistry.get(n).timestamp
 *
 * Nothing here is worth anything if that ordering can be faked, which is why the
 * registry has no update, no delete, and no admin.
 *
 *     TARGET=mainnet pnpm thesis:publish "free text thesis"
 *     TARGET=mainnet pnpm thesis:publish --fixture     # deterministic, no LLM
 */
import { formatEther, type Address } from 'viem';
import { THESIS_REGISTRY_ABI } from './abi';
import { pickProvider } from './provider';
import { thesisHash, type Thesis } from './thesis';
import { fixtureProvider } from './thesis-fixture';
import { accountFrom, chainFor, deploymentFor, target, waitUntil, walletFor,
  waitForReceipt,
} from './wallet';

const args = process.argv.slice(2);
const useFixture = args.includes('--fixture');
const text = args.find((a) => !a.startsWith('--'));

if (!useFixture && !text) {
  throw new Error('give a thesis as free text, or pass --fixture for the recorded one');
}

const t = target();
const chain = chainFor(t);
const deployment = deploymentFor(t);
const REGISTRY = deployment.contracts.ThesisRegistry as Address | undefined;

if (!REGISTRY) {
  throw new Error(
    `no ThesisRegistry recorded for ${deployment.name}. Deploy it and fill in src/deployments.ts.`,
  );
}

const account = accountFrom('OWNER_KEY', 'PRIVATE_KEY');
const wallet = walletFor(account, t);

console.log(`\n  ThesisRegistry ${REGISTRY}  (${deployment.name}, chain ${chain.id})`);
console.log(`  author         ${account.address}`);

// ------------------------------------------------------------- 1. compile

const { provider, label, live } = useFixture
  ? { provider: fixtureProvider(), label: 'fixture (recorded)', live: false }
  : pickProvider();

console.log(`\n  compiling with ${label}…`);
const thesis: Thesis = await provider.compile(text ?? '');

console.log(`\n  claim     ${thesis.claim}`);
console.log(`  horizon   ${thesis.horizonDays} days`);
console.log(`  chain     ${thesis.causalChain.length} steps`);
console.log(
  `  benefits  ${thesis.beneficiaries.map((b) => b.entity).join(', ')}` +
    (live ? '' : '  (recorded output — the input text was ignored)'),
);

// --------------------------------------------------------------- 2. hash

const hash = thesisHash(thesis);
console.log(`\n  hash      ${hash}`);

// Refusing early rather than paying gas to learn it. The revert carries the
// original author, which is the useful part: it says who called it first.
const [existingId, exists] = await wallet.readContract({
  address: REGISTRY,
  abi: THESIS_REGISTRY_ABI,
  functionName: 'idOf',
  args: [hash],
});

if (exists) {
  const prior = await wallet.readContract({
    address: REGISTRY,
    abi: THESIS_REGISTRY_ABI,
    functionName: 'get',
    args: [existingId],
  });
  console.log(
    `\n  already published as thesis #${existingId} by ${prior.author}` +
      ` at ${new Date(Number(prior.publishedAt) * 1000).toISOString()}` +
      `\n  A thesis can only be claimed once. Nothing to do.\n`,
  );
  process.exit(0);
}

// ------------------------------------------------------------ 3. publish

// The bundle is not pinned yet, and the hash is what binds — a CID can be added
// to a later thesis once there is somewhere to pin it. Publishing an empty CID
// is honest; publishing a CID that resolves to nothing is not.
const cid = process.env.THESIS_CID ?? '';

console.log(`\n  publishing…${cid ? ` cid ${cid}` : ' (no CID — the hash is what binds)'}`);
const txHash = await wallet.writeContract({
  address: REGISTRY,
  abi: THESIS_REGISTRY_ABI,
  functionName: 'publish',
  args: [hash, cid],
});

let gasUsed: bigint | null = null;
try {
  const receipt = await waitForReceipt(wallet, txHash);
  gasUsed = receipt.gasUsed;
} catch {
  // The RPC load-balances; a confirmed transaction can outrun a readable block
  // (D18). The state poll below is the real confirmation.
  console.log(`  (receipt unavailable — confirming from state instead)`);
}

console.log(`  tx        ${txHash}${gasUsed === null ? '' : `  (gas ${gasUsed})`}`);

const [id] = await waitUntil(
  () =>
    wallet.readContract({
      address: REGISTRY,
      abi: THESIS_REGISTRY_ABI,
      functionName: 'idOf',
      args: [hash],
    }),
  ([, found]) => found,
  { what: 'the published thesis' },
);

const stored = await wallet.readContract({
  address: REGISTRY,
  abi: THESIS_REGISTRY_ABI,
  functionName: 'get',
  args: [id],
});

console.log(`\n  thesis #${id}  published ${new Date(Number(stored.publishedAt) * 1000).toISOString()}`);
console.log(`  author        ${stored.author}`);
console.log(`  block         ${stored.blockNumber}`);
console.log(`  gas left      ${formatEther(await wallet.getBalance({ address: account.address }))} OKB`);
console.log(
  `\n  Now execute against it, and the receipt will carry the same hash:\n` +
    `    THESIS_HASH=${hash} TARGET=${t} pnpm execute <symbol> <usdg>\n`,
);

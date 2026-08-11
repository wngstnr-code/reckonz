/**
 * `src/abi.ts` against the compiled contracts.
 *
 * The ABIs are hand-maintained so they can carry comments and stay readable, and
 * that is exactly why they can drift: change a struct field in Solidity and the
 * TypeScript keeps compiling while every call encodes to the wrong selector. The
 * chain would reject it, but only at the point where someone is spending gas.
 *
 * Selectors are the check because they cover what matters — a name, its argument
 * types, and for structs every field in order. Parameter names are cosmetic and
 * do not enter the hash, so renaming one for clarity is safe and this stays
 * quiet about it.
 *
 * Run it after touching a contract, or `abi.ts`. Requires `forge build` first.
 */
import { readFileSync } from 'node:fs';
import { toEventSelector, toFunctionSelector, type Abi } from 'viem';
import {
  EXECUTOR_ABI,
  FAIR_VALUE_ORACLE_ABI,
  FEE_COLLECTOR_ABI,
  POLICY_GUARD_ABI,
  RECEIPT_REGISTRY_ABI,
  THESIS_REGISTRY_ABI,
} from './abi';

type AbiEntry = Abi[number];

/** An error's selector is computed exactly like a function's. */
const errorSelector = (a: Extract<AbiEntry, { type: 'error' }>) =>
  toFunctionSelector({ type: 'function', name: a.name, inputs: a.inputs, outputs: [], stateMutability: 'nonpayable' });

function selectors(abi: Abi): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of abi) {
    if (a.type === 'function') out.set(`f${toFunctionSelector(a)}`, `function ${a.name}`);
    else if (a.type === 'event') out.set(`e${toEventSelector(a)}`, `event ${a.name}`);
    else if (a.type === 'error') out.set(`x${errorSelector(a)}`, `error ${a.name}`);
  }
  return out;
}

const artifact = (path: string): Abi => JSON.parse(readFileSync(path, 'utf8')).abi;

const contracts: { name: string; ours: Abi; artifact: string }[] = [
  { name: 'PolicyGuard', ours: POLICY_GUARD_ABI as Abi, artifact: 'out/PolicyGuard.sol/PolicyGuard.json' },
  { name: 'FairValueOracle', ours: FAIR_VALUE_ORACLE_ABI as Abi, artifact: 'out/FairValueOracle.sol/FairValueOracle.json' },
  { name: 'Executor', ours: EXECUTOR_ABI as Abi, artifact: 'out/Executor.sol/Executor.json' },
  { name: 'ReceiptRegistry', ours: RECEIPT_REGISTRY_ABI as Abi, artifact: 'out/ReceiptRegistry.sol/ReceiptRegistry.json' },
  { name: 'ThesisRegistry', ours: THESIS_REGISTRY_ABI as Abi, artifact: 'out/ThesisRegistry.sol/ThesisRegistry.json' },
  { name: 'FeeCollector', ours: FEE_COLLECTOR_ABI as Abi, artifact: 'out/FeeCollector.sol/FeeCollector.json' },
];

console.log('\n  src/abi.ts vs out/ — selector by selector\n');

let failures = 0;

for (const c of contracts) {
  let compiled: Map<string, string>;
  try {
    compiled = selectors(artifact(c.artifact));
  } catch {
    console.log(`  ${c.name.padEnd(16)} no artifact at ${c.artifact} — run \`forge build\``);
    failures++;
    continue;
  }

  const ours = selectors(c.ours);
  // Absent from abi.ts: tolerated. Trimming a contract down to what a client
  // needs is the point of the file — an unlisted error is the only real cost,
  // and it is reported so the choice stays deliberate.
  const absent = [...compiled].filter(([k]) => !ours.has(k));
  // Present in abi.ts but not on-chain: always a defect. It encodes a call the
  // deployed contract cannot answer.
  const phantom = [...ours].filter(([k]) => !compiled.has(k));

  const verdict = phantom.length ? 'MISMATCH' : 'ok';
  console.log(`  ${c.name.padEnd(16)} ${String(ours.size).padStart(3)} entries   ${verdict}`);

  for (const [, label] of phantom) console.log(`      not on-chain: ${label}`);
  for (const [, label] of absent) console.log(`      not exported: ${label}`);

  if (phantom.length) failures++;
}

console.log(
  failures
    ? `\n  ${failures} contract(s) diverged — abi.ts encodes calls the bytecode cannot answer.\n`
    : '\n  Every exported selector exists in the compiled contract.\n',
);

process.exit(failures ? 1 : 0);

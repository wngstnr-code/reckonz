/**
 * The contract surface, in one place.
 *
 * Every ABI here is generated from the Foundry artefacts in `out/` and matches
 * the deployed bytecode. Three separate scripts used to carry their own trimmed
 * copies; the copies drifted, and a missing `error` entry turns a revert with a
 * name and four arguments into an unreadable hex blob. `src/deployments.ts` is
 * the single source for *where* the contracts are — this is the single source
 * for *what they are*.
 *
 * Errors are declared deliberately. viem decodes a revert against the ABI it was
 * given, so `TriggerFired(0, wMUx, 813, 1000)` only reads as that sentence if the
 * error is listed here. Dropping one to save bytes is how a guard's refusal
 * becomes "execution reverted".
 *
 * **This file must stay importable from the browser.** It is the FE's half of the
 * seam (see `docs/07-team.md`) — pure data, no `node:` import, no RPC client, no
 * key handling, and nothing that reads `process.env`. `src/chain.ts` and
 * `src/deployments.ts` carry the same constraint. Adding a server-only import to
 * any of the three breaks the wallet UI's bundle, not just this file.
 */
import { parseAbi } from 'viem';

// ---------------------------------------------------------------- primitives

/** Enough of ERC-20 to read a balance and grant Permit2 its one-time approval. */
export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

/**
 * Permit2, only the parts a client touches.
 *
 * The user approves Permit2 once per token, then every fill is authorised by a
 * signature scoped to one amount and one spender — never a standing allowance to
 * the executor. `nonceBitmap` is how you find an unused nonce: bit `n & 0xff` of
 * word `n >> 8`. A used nonce makes the transaction revert on submission, which
 * is an expensive way to discover the collision.
 */
export const PERMIT2_ABI = parseAbi([
  'function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);

// ---------------------------------------------------------------- PolicyGuard

/**
 * `PolicyGuard` — the mandate, its policy, its exit triggers, and the check that
 * runs inside the trade's own transaction.
 *
 * A wallet UI needs `createMandate`, `setTriggers`, `setAssetAllowed` and
 * `setCircuitBreaker` to write, and `getMandate` / `firedTriggers` / `dryRun` to
 * show the user what the guard would decide before they spend gas on it.
 * `validateAndRecord` is callable only by the mandate's executor — it is here so
 * reverts decode, not because a browser should ever call it.
 */
/**
 * Safe 1.4.1. Not ours, so `pnpm verify:abi` does not check it — the same
 * footing as `ERC20_ABI` and `PERMIT2_ABI`.
 *
 * Only the pre-validated signature path is used: an owner records approval
 * on-chain with `approveHash`, and `execTransaction` is handed a signature of
 * `r = owner, s = 0, v = 1`. That needs no EIP-712 signing, no Safe web UI and
 * no transaction service — none of which are proven to exist for X Layer, and
 * an unproven dependency is how D35 happened.
 */
export const SAFE_PROXY_FACTORY_ABI = parseAbi([
  'function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
  'event ProxyCreation(address indexed proxy, address singleton)',
]);

export const SAFE_ABI = parseAbi([
  'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function isOwner(address owner) view returns (bool)',
  'function nonce() view returns (uint256)',
  'function approveHash(bytes32 hashToApprove)',
  'function approvedHashes(address owner, bytes32 hash) view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)',
]);

export const POLICY_GUARD_ABI = parseAbi([
  'struct Policy { uint16 maxWeightBps; uint16 minCashBufferBps; uint16 maxSlippageBps; uint16 maxDeviationBps; uint8 maxGapRisk; uint128 maxNotionalPerTrade; uint16 maxFillsPerEpoch; uint32 epochDuration; uint32 minRebalanceInterval; bool enforceWeights; }',
  'struct Mandate { address owner; address agent; address executor; uint32 version; bool active; bool circuitBreaker; uint64 lastActionAt; uint64 epochStart; uint16 fillsThisEpoch; Policy policy; }',
  'struct Trigger { uint8 metric; uint8 comparator; int256 threshold; address[] assets; }',
  'struct Position { uint128 units; uint128 costBasisE8; uint128 entryFairValueE8; }',
  'struct Fill { address asset; bool isExit; uint128 amountInUsdg; uint128 amountOut; uint128 executionPriceE8; uint16 slippageBps; uint128 fairValueE8; uint8 gapRisk; }',

  // writes — owner only
  'function createMandate(address agent, address executor, Policy policy, address[] assets) returns (uint256 mandateId)',
  'function updatePolicy(uint256 mandateId, Policy policy)',
  'function setAgent(uint256 mandateId, address agent)',
  'function setExecutor(uint256 mandateId, address executor)',
  'function setAssetAllowed(uint256 mandateId, address asset, bool allowed)',
  'function setCircuitBreaker(uint256 mandateId, bool tripped)',
  'function setTriggers(uint256 mandateId, Trigger[] triggers)',
  'function closeMandate(uint256 mandateId)',

  // write — executor only
  'function validateAndRecord(uint256 mandateId, Fill[] fills, bytes32 thesisHash, bytes32 evidenceHash, string evidenceCID) returns (uint256 receiptId)',

  // reads
  'function dryRun(uint256 mandateId, Fill[] fills) view returns (bool ok, bytes32 reason, address offendingAsset)',
  'function firedTriggers(uint256 mandateId) view returns (uint256[] triggerIndexes, address[] assets, address[] staleAssets)',
  'function getMandate(uint256 mandateId) view returns (Mandate)',
  'function getTriggers(uint256 mandateId) view returns (Trigger[])',
  'function getPosition(uint256 mandateId, address asset) view returns (Position)',
  'function allowedAssets(uint256 mandateId) view returns (address[])',
  'function isAllowedAsset(uint256 mandateId, address asset) view returns (bool)',
  'function nextMandateId() view returns (uint256)',
  'function oracle() view returns (address)',
  'function receipts() view returns (address)',
  'function cash() view returns (address)',
  'function MAX_ASSETS() view returns (uint256)',
  'function MAX_TRIGGERS() view returns (uint256)',

  'event MandateCreated(uint256 indexed mandateId, address indexed owner, address indexed agent)',
  'event PolicyUpdated(uint256 indexed mandateId, uint32 version)',
  'event AgentChanged(uint256 indexed mandateId, address agent)',
  'event ExecutorChanged(uint256 indexed mandateId, address executor)',
  'event AssetAllowed(uint256 indexed mandateId, address indexed asset, bool allowed)',
  'event CircuitBreakerSet(uint256 indexed mandateId, bool tripped)',
  'event TriggersSet(uint256 indexed mandateId, uint256 count, uint32 version)',
  'event MandateClosed(uint256 indexed mandateId)',
  'event Executed(uint256 indexed mandateId, uint256 indexed receiptId, uint256 fills)',

  // Every way the guard says no. These are the product, not error handling.
  'error AssetNotAllowed(address asset)',
  'error BadPolicy()',
  'error CashBufferBreached(uint256 weightBps, uint16 limit)',
  'error DecimalsUnknown(address asset)',
  'error EpochFillLimit(uint16 used, uint16 limit)',
  'error Inactive()',
  'error MetricUnavailable(uint8 metric)',
  'error NoFills()',
  'error NotExecutor()',
  'error NotOwner()',
  'error NotionalTooLarge(address asset, uint128 amount, uint128 limit)',
  'error OracleRejected(address asset, bytes32 reason)',
  'error SlippageTooHigh(address asset, uint16 realised, uint16 limit)',
  'error TooManyAssets()',
  'error TooManyTriggers()',
  'error TooSoon(uint64 lastActionAt, uint32 minInterval)',
  'error TriggerFired(uint256 triggerIndex, address asset, int256 value, int256 threshold)',
  'error Tripped()',
  'error WeightExceeded(address asset, uint256 weightBps, uint16 limit)',
]);

// ------------------------------------------------------------ FairValueOracle

/**
 * `FairValueOracle` — an estimate, its uncertainty, and a risk score.
 *
 * `peek` reverts when the value is stale or withheld; `observation` returns the
 * raw record and never reverts. Use `observation` to render, `peek` to decide.
 * A UI that renders `peek`'s revert as a failure is showing the user a bug where
 * the oracle is doing its job.
 */
export const FAIR_VALUE_ORACLE_ABI = parseAbi([
  'struct Observation { uint128 fairValueE8; uint32 confidenceBps; int32 basisBps; uint128 capacityUsdg; uint8 gapRisk; uint8 state; uint64 anchorAt; uint64 updatedAt; bool hasValue; }',
  'struct Publication { address asset; uint128 fairValueE8; uint32 confidenceBps; int32 basisBps; uint128 capacityUsdg; uint8 gapRisk; uint8 state; uint64 anchorAt; bool hasValue; }',

  'function publish(Publication p)',
  'function publishMany(Publication[] items)',
  'function setPublisher(address publisher, bool allowed)',
  'function setMaxAge(uint64 newMaxAge)',
  'function setAdmin(address newAdmin)',

  'function observation(address asset) view returns (Observation)',
  'function peek(address asset) view returns (Observation)',
  'function fairValue(address asset) view returns (uint128 valueE8, uint32 confidenceBps, uint8 gapRisk)',
  'function checkExecution(address asset, uint256 executionPriceE8, uint8 maxGapRisk, uint32 maxDeviationBps) view returns (bool ok, bytes32 reason)',
  'function isPublisher(address account) view returns (bool)',
  'function maxAge() view returns (uint64)',
  'function admin() view returns (address)',

  'event Published(address indexed asset, uint128 fairValueE8, uint8 gapRisk, uint8 state)',
  'event PublisherSet(address indexed publisher, bool allowed)',
  'event MaxAgeSet(uint64 maxAge)',
  'event AdminSet(address indexed admin)',

  'error GapRiskOutOfRange(uint8 gapRisk)',
  'error NoData()',
  'error NotAdmin()',
  'error NotPublisher()',
  'error Stale(uint64 updatedAt, uint64 nowTs)',
  'error ValueWithheld()',
  'error ValuelessPublication(address asset)',
  'error ZeroAddress()',
]);

// ------------------------------------------------------------------ Executor

/**
 * `Executor` — Permit2 pull, swap, settle, submit, all in one transaction.
 *
 * `execute` is callable only by the mandate's agent, and the guard runs inside
 * it: a policy breach unwinds the swap rather than reporting it afterwards.
 *
 * A leg names a fee tier, not an encoded route: the executor derives the pool
 * from the pair and that tier, because the Universal Router cannot swap on this
 * chain (D35). `uniswapV3SwapCallback` is deliberately absent — only a pool
 * calls it, mid-swap, and `pnpm verify:abi` reports the omission so it stays a
 * choice rather than an oversight.
 */
export const EXECUTOR_ABI = parseAbi([
  'struct Leg { address asset; uint128 amountInUsdg; uint256 minAmountOut; uint24 fee; }',
  'struct TokenPermissions { address token; uint256 amount; }',
  'struct PermitBatchTransferFrom { TokenPermissions[] permitted; uint256 nonce; uint256 deadline; }',

  'function execute(uint256 mandateId, Leg[] legs, PermitBatchTransferFrom permit, bytes signature, bytes32 thesisHash, bytes32 evidenceHash, string evidenceCID) returns (uint256 receiptId)',

  'function guard() view returns (address)',
  'function oracle() view returns (address)',
  'function permit2() view returns (address)',
  'function factory() view returns (address)',
  'function cash() view returns (address)',
  'function feeCollector() view returns (address)',
  'function poolFor(address tokenA, address tokenB, uint24 fee) view returns (address)',

  'event Executed(uint256 indexed mandateId, uint256 indexed receiptId, uint256 legs)',

  'error AmountOverflow(address asset, uint256 amount)',
  'error NoLegs()',
  'error NotAgent(address caller, address agent)',
  'error NotThisExecutor(address configured)',
  'error NothingReceived(address asset)',
  'error PermitMismatch()',
  'error ResidualBalance(address token, uint256 amount)',
  'error InsufficientOutput(uint256 received, uint256 minimum)',
  'error PoolHasNoCode(address pool)',
  'error AmountInTooLarge(uint256 amountIn)',
  'error UnexpectedCallback(address caller)',
  'error ZeroAmountIn()',
]);

// ----------------------------------------------------------- ReceiptRegistry

/**
 * `ReceiptRegistry` — append-only. The track record the product sells rests on
 * nobody being able to rewrite this, so there is no update and no delete.
 */
export const RECEIPT_REGISTRY_ABI = parseAbi([
  'struct Receipt { uint256 mandateId; uint32 policyVersion; bytes32 thesisHash; bytes32 evidenceHash; address agent; uint64 timestamp; uint64 blockNumber; }',
  'struct Fill { address asset; bool isExit; uint128 amountInUsdg; uint128 amountOut; uint128 executionPriceE8; uint16 slippageBps; uint128 fairValueE8; uint8 gapRisk; }',

  'function append(uint256 mandateId, uint32 policyVersion, bytes32 thesisHash, bytes32 evidenceHash, string evidenceCID, address agent, Fill[] fills) returns (uint256 receiptId)',
  'function setWriter(address writer, bool allowed)',
  'function setAdmin(address newAdmin)',

  'function get(uint256 receiptId) view returns (Receipt receipt, Fill[] fills)',
  'function receiptsOf(uint256 mandateId) view returns (uint256[])',
  'function performance(uint256 mandateId) view returns (uint256 totalNotionalUsdg, uint256 weightedSlippageBps, uint256 fillCount)',
  'function count() view returns (uint256)',
  'function isWriter(address account) view returns (bool)',
  'function admin() view returns (address)',

  'event ReceiptAppended(uint256 indexed receiptId, uint256 indexed mandateId, address indexed agent, bytes32 thesisHash, string evidenceCID, uint256 fillCount)',
  'event WriterSet(address indexed writer, bool allowed)',

  'error NoFills()',
  'error NotAdmin()',
  'error NotWriter()',
]);

/**
 * `FeeCollector` — where the execution fee lands.
 *
 * `MAX_FEE_BPS` is a constant in the contract, not a setting, so a consumer can
 * bound their worst case by reading it rather than trusting the admin.
 */
export const FEE_COLLECTOR_ABI = parseAbi([
  'function feeOn(uint256 notionalUsdg) view returns (uint256)',
  'function feeBps() view returns (uint16)',
  'function MAX_FEE_BPS() view returns (uint16)',
  'function treasury() view returns (address)',
  'function admin() view returns (address)',

  'function setFeeBps(uint16 newFeeBps)',
  'function setTreasury(address newTreasury)',
  'function setAdmin(address newAdmin)',
  'function withdraw(address token) returns (uint256 amount)',
  'function record(uint256 mandateId, address asset, uint256 notionalUsdg, uint256 feeUsdg)',

  'event FeeTaken(uint256 indexed mandateId, address indexed asset, uint256 notionalUsdg, uint256 feeUsdg)',
  'event FeeBpsSet(uint16 feeBps)',
  'event TreasurySet(address indexed treasury)',
  'event AdminSet(address indexed admin)',
  'event Withdrawn(address indexed token, address indexed to, uint256 amount)',

  'error NotAdmin()',
  'error FeeTooHigh(uint16 requested, uint16 maximum)',
  'error ZeroAddress()',
]);

/**
 * `ThesisRegistry` — append-only, no admin, one author per hash.
 *
 * Resolve a receipt's `thesisHash` here to find who published the reasoning and
 * when. If `publishedAt` precedes the receipt's timestamp, the thesis existed
 * before the outcome did — which is the entire claim.
 */
export const THESIS_REGISTRY_ABI = parseAbi([
  'struct Thesis { address author; bytes32 contentHash; uint64 publishedAt; uint64 blockNumber; string cid; }',

  'function publish(bytes32 contentHash, string cid) returns (uint256 thesisId)',

  'function get(uint256 thesisId) view returns (Thesis)',
  'function idOf(bytes32 contentHash) view returns (uint256 thesisId, bool exists)',
  'function authorOf(bytes32 contentHash) view returns (address)',
  'function thesesOf(address author) view returns (uint256[])',
  'function count() view returns (uint256)',

  'event ThesisPublished(uint256 indexed thesisId, address indexed author, bytes32 indexed contentHash, string cid)',

  'error AlreadyPublished(uint256 thesisId, address author)',
  'error EmptyHash()',
]);

// --------------------------------------------------------------------- enums

/**
 * `ExitTriggers.Metric`, in declaration order. The index *is* the on-chain
 * value, so this array must never be reordered — only appended to, and only
 * alongside the Solidity enum and `OBSERVABLE_METRICS` in `src/thesis.ts`.
 */
export const TRIGGER_METRICS = [
  'gapRisk',
  'basisBps',
  'confidenceBps',
  'stalenessHours',
  'drawdownBpsFromEntry',
  'capacityUsdg',
  'priceVsThesisEntryBps',
] as const;

export type TriggerMetric = (typeof TRIGGER_METRICS)[number];

/** `ExitTriggers.Comparator`, in declaration order. */
export const TRIGGER_COMPARATORS = ['gt', 'lt'] as const;

export type TriggerComparator = (typeof TRIGGER_COMPARATORS)[number];

/**
 * `FairValueOracle.MarketState`, in declaration order.
 *
 * `NO_REFERENCE` is not an error — it is the oracle refusing to publish a value
 * it cannot defend. Render it as a withholding, never as a zero price.
 */
export const MARKET_STATES = [
  'OPEN',
  'PRE',
  'POST',
  'CLOSED_OVERNIGHT',
  'CLOSED_WEEKEND',
  'NO_REFERENCE',
] as const;

export type MarketState = (typeof MARKET_STATES)[number];

/** Encode a metric name to the `uint8` the contract expects. */
export function metricIndex(metric: TriggerMetric): number {
  return TRIGGER_METRICS.indexOf(metric);
}

/** Encode a comparator name to the `uint8` the contract expects. */
export function comparatorIndex(comparator: TriggerComparator): number {
  return TRIGGER_COMPARATORS.indexOf(comparator);
}

/**
 * Decode a `uint8` read back from the chain. Returns `undefined` rather than
 * guessing when the contract is newer than this file — a wrong label on a risk
 * metric is worse than a missing one.
 */
export function metricName(index: number): TriggerMetric | undefined {
  return TRIGGER_METRICS[index];
}

export function marketStateName(index: number): MarketState | undefined {
  return MARKET_STATES[index];
}

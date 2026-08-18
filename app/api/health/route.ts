import type { Address } from 'viem';
import { FAIR_VALUE_ORACLE_ABI, POLICY_GUARD_ABI } from '@/src/abi';
import { client, serial } from '@/src/chain';
import { MAINNET, PUBLISHER } from '@/src/deployments';
import { hasBlobCredentials } from '@/src/evidence-store';
import { classifyHealth, healthHttpStatus, type AssetHealth, type PublisherGas } from '@/src/health';
import { loadToken } from '@/src/pool';
import { clientKey, createGate, tooMany } from '@/src/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Generous, because the caller is meant to be a robot on a one-minute timer.
 * Still gated: this makes RPC reads, and an unbounded health endpoint is a way
 * to exhaust the thing it is watching.
 */
const gate = createGate('health', { burst: 20, perMinute: 60, maxInFlight: 3 });

/**
 * The mandate whose allowlist decides what "executable" means. Mandate #1 on the
 * 2026-08-12 guard is the live one; overridable so this does not need a deploy
 * when that changes.
 */
const MANDATE_ID = BigInt(process.env.HEALTH_MANDATE_ID ?? 1);

/**
 * Answers cached for half a minute. Several monitors and a human refreshing all
 * hit the same reads, and the underlying facts do not move faster than this —
 * the oracle publishes every ten minutes at best.
 */
let cached: { at: number; body: string; status: number } | null = null;
const TTL_MS = 30_000;

/**
 * `GET /api/health` — can this system currently execute a fill?
 *
 * Not "did the server respond". On 2026-08-14 the deployed oracle had been
 * stale for two days, every fill was refused, and the deployment answered every
 * request in milliseconds the whole time. A healthcheck that would have called
 * that healthy is not worth writing, so this one returns **503 when nothing can
 * trade** — see `classifyHealth` for the rule.
 *
 * Public and safe to be: every address in the response is already on chain and
 * in `docs/`, and the two configuration flags are booleans about whether a
 * credential exists, never the credential.
 */
export async function GET(request: Request) {
  const pass = gate.enter(clientKey(request));
  if (!pass.ok) return tooMany(pass);

  try {
    if (cached && Date.now() - cached.at < TTL_MS) {
      return new Response(cached.body, {
        status: cached.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-cache': 'hit' },
      });
    }

    const deployment = MAINNET;
    const guard = deployment?.contracts.PolicyGuard as Address | undefined;
    const oracle = deployment?.contracts.FairValueOracle as Address | undefined;

    let blockNumber: bigint | null = null;
    let rpcLatencyMs: number | null = null;
    const assets: AssetHealth[] = [];
    let publisher: PublisherGas | null = null;

    const startedAt = Date.now();
    try {
      blockNumber = await client.getBlockNumber();
      rpcLatencyMs = Date.now() - startedAt;
    } catch {
      // Left null. `classifyHealth` calls that `down`, which is the honest
      // reading: without the RPC nothing can be quoted, priced or executed.
    }

    if (blockNumber !== null && guard && oracle) {
      try {
        const [allowed, maxAge] = await Promise.all([
          client.readContract({
            address: guard,
            abi: POLICY_GUARD_ABI,
            functionName: 'allowedAssets',
            args: [MANDATE_ID],
          }),
          client.readContract({
            address: oracle,
            abi: FAIR_VALUE_ORACLE_ABI,
            functionName: 'maxAge',
          }),
        ]);

        const now = Math.floor(Date.now() / 1000);
        // Serial, not `Promise.all`: the public RPC throttles, and a healthcheck
        // that trips the rate limiter is a healthcheck that reports its own
        // noise as an outage.
        const measured = await serial([...allowed], async (asset: Address) => {
          // `peek`, which never reverts — `observation` throws on Stale, which
          // is the condition being measured (D64).
          const [observation, token] = await Promise.all([
            client.readContract({
              address: oracle,
              abi: FAIR_VALUE_ORACLE_ABI,
              functionName: 'peek',
              args: [asset],
            }),
            loadToken(asset).catch(() => ({ symbol: asset })),
          ]);
          const updatedAt = Number(observation.updatedAt);
          const ageSeconds = updatedAt === 0 ? null : Math.max(0, now - updatedAt);
          return {
            symbol: token.symbol,
            ageSeconds,
            maxAgeSeconds: Number(maxAge),
            hasValue: observation.hasValue,
            stale: ageSeconds === null || ageSeconds > Number(maxAge),
          } satisfies AssetHealth;
        });
        assets.push(...measured);
      } catch {
        // The chain answered but the mandate did not read. Reported as no
        // assets, which `classifyHealth` treats as nothing executable.
      }
    }

    if (blockNumber !== null) {
      try {
        // Two reads, and neither is about a contract: what the publisher can
        // still afford is a fact about the *operation*, and it is the one
        // outage here with a date on it (D85). Failing softly to null keeps a
        // throttled RPC from turning a gas check into an outage report.
        const [balanceWei, gasPriceWei] = await Promise.all([
          client.getBalance({ address: PUBLISHER as Address }),
          client.getGasPrice(),
        ]);
        publisher = { address: PUBLISHER, balanceWei, gasPriceWei };
      } catch {
        // Left null. `classifyHealth` says the runway is unknown, which is a
        // different sentence from "the runway is short" and reads as one.
      }
    }

    const report = classifyHealth({
      blockNumber,
      rpcLatencyMs,
      mandateId: Number(MANDATE_ID),
      assets,
      archiveConfigured: hasBlobCredentials(),
      compilerConfigured: Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY),
      publisher,
    });

    const body = JSON.stringify(
      { ...report, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null },
      null,
      2,
    );
    const status = healthHttpStatus(report.status);
    cached = { at: Date.now(), body, status };

    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-cache': 'miss' },
    });
  } finally {
    pass.release();
  }
}

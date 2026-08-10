import { Console } from './components/Console';
import { MAINNET, TESTNET } from '@/src/deployments';
import { DEFAULT_MANDATE } from '@/src/guard';
import { pickProvider } from '@/src/provider';

export const dynamic = 'force-dynamic';

/** Server component: the deployment and provider facts come from the same
 *  modules the pipeline uses, so the header cannot drift from the engine. */
export default function Page() {
  const deployments = [TESTNET, MAINNET].filter((d) => d !== null);
  let provider: string;
  try {
    provider = pickProvider().label;
  } catch (e) {
    provider = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <header className="mb-7 border-b border-line bg-gradient-to-b from-[#10141a] to-ground py-7">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-start justify-between gap-6 px-6">
          <div className="flex items-start gap-3.5">
            <span className="text-[26px] leading-none text-signal">◇</span>
            <div>
              <h1 className="text-[21px] font-semibold tracking-tight">
                Reckonz
                <span className="ml-2.5 font-mono text-[11px] font-normal tracking-normal text-faint">
                  thesis → basket
                </span>
              </h1>
              <p className="mt-1 max-w-[46ch] text-[13.5px] text-dim">
                Non-custodial execution and risk tooling for tokenised equities on X&nbsp;Layer.
                You write the thesis; Reckonz maps it, sizes it against real depth, and enforces
                the exits on chain.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {deployments.map((d) => (
              <span
                key={d.chainId}
                className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-dim"
              >
                {d.name} <b className="font-normal text-signal">{d.chainId}</b> ·{' '}
                {Object.keys(d.contracts).length} contracts live
              </span>
            ))}
            <span className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-dim">
              guard: gap ≤ {DEFAULT_MANDATE.maxGapRisk} · ≤ {DEFAULT_MANDATE.maxDeviationBps}bp off
              fair value · ≤ {DEFAULT_MANDATE.maxImpactBps}bp impact
            </span>
            <span className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-faint">
              {provider}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-6">
        <Console />

        <section className="mb-4 rounded-xl border border-line bg-panel px-6 py-5">
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight">
            Deployed on X&nbsp;Layer
          </h2>
          {deployments.map((d) => (
            <div key={d.chainId} className="mb-3 last:mb-0">
              <p className="mb-2 text-[11px] tracking-[0.09em] text-faint uppercase">
                {d.name} · chain {d.chainId}
              </p>
              <ul className="grid gap-1">
                {Object.entries(d.contracts).map(([name, address]) => (
                  <li
                    key={name}
                    className="flex flex-wrap items-baseline gap-x-3 font-mono text-[12px]"
                  >
                    <span className="w-[190px] text-dim">{name}</span>
                    <a
                      href={`${d.explorer}/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-faint hover:text-signal"
                    >
                      {address}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <footer className="max-w-[72ch] pt-2 pb-16 text-[12.5px] leading-relaxed text-faint">
          The oracle is a guard, not a price: when it cannot defend a number it marks the value
          unpublishable rather than inventing one. Capacity is reported honestly — capital the
          market cannot absorb is returned, not forced. The agent proposes routing and never holds
          a key that can move funds; PolicyGuard bounds execution and reverts in the trade&apos;s
          own transaction. Tooling, not investment advice.
        </footer>
      </main>
    </>
  );
}

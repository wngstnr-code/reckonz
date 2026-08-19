'use client';

import type { RunState } from '../../useRun';
import { STAGES } from '../../useRun';

/**
 * The six stages as rows, not chips.
 *
 * A run takes about two minutes and the whole of its feedback used to be six
 * grey pills in a row, distinguished by a pale border on the active one. Driving
 * a real run, eighty-five seconds passed with nothing to read: no sense of which
 * stage was slow, what it was doing, or how far along it was.
 *
 * Rows cost a little vertical space and buy the two things a wait needs -- what
 * is happening now, and what each step is for. The description is the half a
 * chip had no room for, and it is what turns a progress indicator into an
 * explanation of the product.
 */

const WHAT: Record<string, string> = {
  compile: 'the words become named assets and weights',
  universe: 'which of the thirty we can actually price',
  allocate: 'weights become a basket at your size',
  mandate: 'the exit rules the thesis implies',
  plan: 'what each pool will absorb before it moves',
  oracle: 'what the chain will refuse, and why',
};

export function RunTimeline({ state }: { state: RunState }) {
  return (
    <ol className="grid">
      {STAGES.map((s) => {
        const status = state.status[s.id];
        const label = state.label[s.id];

        return (
          <li
            key={s.id}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line/60 py-3 last:border-b-0"
          >
            <span className="flex w-32 shrink-0 items-baseline gap-2.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                  status === 'active'
                    ? 'animate-breathe bg-caution'
                    : status === 'done'
                      ? 'bg-signal'
                      : 'bg-faint'
                }`}
                aria-hidden
              />
              <span
                className={`font-mono text-meta ${
                  status === 'idle' ? 'text-faint' : 'text-ink'
                }`}
              >
                {s.title}
              </span>
            </span>

            <span
              className={`min-w-0 flex-1 text-meta ${status === 'idle' ? 'text-faint' : 'text-dim'}`}
            >
              {WHAT[s.id]}
            </span>

            {/* What the stage actually found, once it has. The chips carried
                this too and had room for about four words of it. */}
            {label && status === 'done' && (
              <span className="font-mono text-meta tabular-nums text-dim">{label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A failed run, in our words rather than the provider's.
 *
 * The first real run of this page ended by printing
 * `{"error":{"code":503,"message":"This model is currently experiencing high
 * demand"...}}` across the page after eighty-five seconds of waiting, with no
 * way to try again. A raw provider payload is not an error message: it does not
 * say whether the fault was the user's, whether anything was charged, or whether
 * trying again is worth it.
 *
 * The provider's own text is kept, small, underneath. It is the part that helps
 * when the failure is not one of the ones named here.
 */
export function RunError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { headline, transient } = read(message);

  return (
    <div className="rounded-xl border border-refuse/40 bg-refuse/6 px-4 py-4">
      <p className="max-w-[68ch] text-data leading-relaxed text-ink">{headline}</p>
      <p className="mt-1.5 max-w-[68ch] text-meta leading-relaxed text-dim">
        Nothing was signed and no wallet was touched. The run stopped where it stopped.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {transient && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-ink px-5 py-3 text-data font-semibold whitespace-nowrap text-ground transition-opacity duration-200 hover:opacity-90"
          >
            Try again
          </button>
        )}
        <p className="min-w-0 font-mono text-micro tracking-normal break-words text-faint normal-case">
          {message}
        </p>
      </div>
    </div>
  );
}

/**
 * Turn whatever came back into a sentence, and say whether retrying is sensible.
 *
 * Deliberately shallow: three shapes we have actually seen, and an honest
 * fallback for everything else. Guessing at a cause we cannot identify would put
 * a confident wrong sentence where an accurate vague one belongs.
 */
function read(message: string): { headline: string; transient: boolean } {
  const text = message.toLowerCase();

  if (text.includes('503') || text.includes('unavailable') || text.includes('high demand')) {
    return {
      headline: 'The model was busy and did not answer. This is usually over in a minute.',
      transient: true,
    };
  }
  if (text.includes('429') || text.includes('quota') || text.includes('rate')) {
    return {
      headline: 'The model refused another request for now: too many in a short window.',
      transient: true,
    };
  }
  if (text.includes('api key') || text.includes('401') || text.includes('permission')) {
    return {
      headline:
        'This deployment has no working model key, so a thesis cannot be compiled here. That is our configuration, not your input.',
      transient: false,
    };
  }
  return { headline: 'The run did not finish. What came back is below.', transient: true };
}

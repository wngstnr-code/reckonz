/**
 * Provider selection, shared by the CLI demos and the server.
 *
 * **Gemini or the fixture, and nothing else.** A Claude provider lived here
 * until 2026-08-12 and had never once been executed — it was typechecked, it
 * looked finished, and no run had ever proved it worked. The hazard was not the
 * dead code but the *selection*: `pickProvider` chose whichever credential
 * happened to be present, so a stray `ANTHROPIC_API_KEY` in an environment would
 * have silently routed the thesis compiler through a path nobody had ever run.
 * Deleting it closes that permanently instead of documenting it forever (D59).
 *
 * The interface is the point — the schema enforces the observable-metric
 * contract regardless of which model is behind it, and a second provider can be
 * added when there is a reason to run one.
 *
 * **The fixture has to be asked for.** It used to be the floor: with no
 * credential set, `compile` returned a recorded thesis for *any* input text. The
 * label said so and the UI printed the label, which is not the same as the run
 * being honest — a judge, or either of us, could paste a thesis, watch six
 * stages complete, and read an answer that was written before the question. A
 * recorded output is a legitimate thing to run against; silently substituting it
 * for a compilation nobody could perform is not. So it is now reachable only
 * through `LLM_PROVIDER=fixture`, and a missing key is an error with a sentence
 * rather than a plausible-looking result.
 */
import type { ThesisProvider } from './thesis';
import { fixtureProvider } from './thesis-fixture';
import { geminiModel, geminiProvider } from './thesis-gemini';

export interface SelectedProvider {
  provider: ThesisProvider;
  label: string;
  /** False when the recorded fixture is answering and the input text is ignored. */
  live: boolean;
}

export function pickProvider(): SelectedProvider {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (forced && forced !== 'gemini' && forced !== 'fixture') {
    throw new Error(
      `LLM_PROVIDER=${forced} is not a provider this build has. Use gemini, or fixture.`,
    );
  }

  if (forced === 'gemini' || (!forced && hasGemini)) {
    if (!hasGemini) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set');
    return { provider: geminiProvider(), label: `${geminiModel} (live)`, live: true };
  }

  if (forced === 'fixture') {
    return {
      provider: fixtureProvider(),
      label: 'fixture (recorded) — LLM_PROVIDER=fixture; the input text is ignored',
      live: false,
    };
  }

  // No credential and nothing asked for. Falling back to the fixture here would
  // answer every thesis with the same recorded one, which reads as a working
  // system rather than as a missing key.
  throw new Error(
    'no LLM credential: set GEMINI_API_KEY to compile a thesis, or LLM_PROVIDER=fixture to run ' +
      'the recorded one deliberately (it ignores the input text and returns the same thesis ' +
      'every time).',
  );
}

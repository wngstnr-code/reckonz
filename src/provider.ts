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
 * The fixture is the floor, so the pipeline is always runnable with no
 * credential at all. The interface is the point — the schema enforces the
 * observable-metric contract regardless of which model is behind it, and a
 * second provider can be added when there is a reason to run one.
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
      `LLM_PROVIDER=${forced} is not a provider this build has. Use gemini, or unset it.`,
    );
  }

  if (forced === 'gemini' || (!forced && hasGemini)) {
    if (!hasGemini) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set');
    return { provider: geminiProvider(), label: `${geminiModel} (live)`, live: true };
  }

  return {
    provider: fixtureProvider(),
    label: 'fixture — no LLM credential set; recorded output, input text ignored',
    live: false,
  };
}

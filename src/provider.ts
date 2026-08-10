/**
 * Provider selection, shared by the CLI demos and the server.
 *
 * `LLM_PROVIDER` forces one; otherwise whichever credential is present wins,
 * and the fixture is the floor so the pipeline is always runnable. The
 * interface is the point — the schema enforces the observable-metric contract
 * regardless of which model is behind it.
 */
import { claudeProvider, type ThesisProvider } from './thesis';
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
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  if (forced === 'gemini' || (!forced && hasGemini)) {
    if (!hasGemini) throw new Error('LLM_PROVIDER=gemini but GEMINI_API_KEY is not set');
    return { provider: geminiProvider(), label: `${geminiModel} (live)`, live: true };
  }
  if (forced === 'claude' || (!forced && hasClaude)) {
    if (!hasClaude) throw new Error('LLM_PROVIDER=claude but ANTHROPIC_API_KEY is not set');
    return { provider: claudeProvider(), label: 'claude-opus-5 (live)', live: true };
  }
  return {
    provider: fixtureProvider(),
    label: 'fixture — no LLM credential set; recorded output, input text ignored',
    live: false,
  };
}

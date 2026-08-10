/**
 * Gemini provider for the Thesis Compiler.
 *
 * Same `ThesisProvider` contract as the Claude one — the schema, the prompts,
 * and everything downstream are unchanged. Only the transport differs, which is
 * the point of having the interface: the observable-metric contract (D15) is
 * enforced by the schema, so it holds whichever model is behind it.
 *
 * Structured output goes through `responseJsonSchema` (backend JSON-schema
 * support, @google/genai >= 1.9). Zod is the single source of truth for the
 * shape; `z.toJSONSchema` derives the wire schema so the two cannot drift.
 */
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  AllocationSchema,
  OBSERVABLE_METRICS,
  ThesisSchema,
  type Allocation,
  type Thesis,
  type ThesisProvider,
} from './thesis';

/**
 * Default is the current stable general-purpose model. The compiler is a
 * reasoning task, not a throughput task — if the free tier's daily quota bites,
 * step down to a `-flash-lite` model rather than shortening the prompt.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

const COMPILER_SYSTEM = `You compile investment theses into structured, falsifiable form for an execution system.

You do not decide what to buy and you do not give investment advice. The user owns the thesis; your job is to make its structure explicit so it can be executed under a mandate and audited afterwards.

Rules:
- Restate the claim as one sentence that could be shown false. If the input is too vague to falsify, say so in the claim itself rather than inventing precision.
- The causal chain is the mechanism. Each step should follow from the one before it. If a step is a leap, that belongs in unstatedAssumptions, not in the chain.
- Beneficiaries: name the company or instrument as commonly known (e.g. "Micron", "NVIDIA", "S&P 500"). Do not guess ticker symbols or on-chain names — a later step resolves those against what is actually tradable.
- Evidence: state what the claim actually rests on. "Asserted by the user, no evidence given" is a correct and useful answer. Never manufacture a citation.
- Confidence is in the causal link holding, not in making money.
- Disconfirming conditions are the point of this exercise. State what would make the user wrong, then map each to a metric the system can measure. Only use metrics from the provided list. If none captures the condition, set observable to false, set trigger to null, and explain why — an honest gap is worth more than a proxy that never fires.
- Thresholds must be defensible from the condition, not round numbers chosen for tidiness.`;

const ALLOCATOR_SYSTEM = `You map a compiled thesis onto assets that are actually tradable, and nothing else.

Rules:
- Use only symbols from the supplied universe. If a beneficiary has no matching asset, put it in unmapped with the reason — never substitute a loosely related asset.
- Weights express conviction and position in the causal chain, and must total 10000 bps across the legs you emit.
- Every leg states which beneficiary it expresses, so the position can be traced back to the claim.
- Do not consider liquidity, position size, or execution — a later stage measures real depth and will cut or stage these weights. Your job is the mapping.`;

/**
 * Gemini rejects a few JSON Schema keywords that Zod emits by default, and
 * ignores `$schema`. Strip what it does not accept rather than hand-maintaining
 * a parallel schema that would silently drift from the Zod types.
 */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === '$schema' || k === 'additionalProperties') continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json);
}

async function generate<T>(
  system: string,
  prompt: string,
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: toGeminiSchema(schema),
    },
  });

  const text = response.text;
  if (!text) {
    // A blocked or empty response is not a parse failure — say which it was.
    const finish = response.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`${label}: empty response (finishReason: ${finish})`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${label}: response was not valid JSON: ${text.slice(0, 200)}`);
  }

  // Validate rather than trust. `responseJsonSchema` is a strong constraint, not
  // a guarantee — and the observable-metric enum is the one thing that must not
  // slip through wrong, since the guard is built from it.
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${label}: response did not match the schema:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function geminiProvider(): ThesisProvider {
  return {
    async compile(text: string): Promise<Thesis> {
      const metricList = Object.entries(OBSERVABLE_METRICS)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');
      return generate(
        COMPILER_SYSTEM,
        `Metrics this system can measure at execution time:\n${metricList}\n\nThesis:\n${text}`,
        ThesisSchema,
        'compile',
      );
    },

    async allocate(
      thesis: Thesis,
      universe: { symbol: string; name?: string }[],
    ): Promise<Allocation> {
      return generate(
        ALLOCATOR_SYSTEM,
        `Investable universe on X Layer:\n` +
          universe.map((a) => `- ${a.symbol}${a.name ? ` (${a.name})` : ''}`).join('\n') +
          `\n\nCompiled thesis:\n${JSON.stringify(thesis, null, 2)}`,
        AllocationSchema,
        'allocate',
      );
    },
  };
}

export const geminiModel = MODEL;

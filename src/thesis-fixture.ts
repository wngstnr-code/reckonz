/**
 * Deterministic provider used by tests and by the demo when no Anthropic
 * credential is configured.
 *
 * This is a recorded example of what the live compiler produces — it is NOT a
 * model and does not read the input text. It exists so the rest of the
 * pipeline (universe discovery, depth-aware sizing, mandate compilation) can be
 * exercised and reviewed without a key, and so tests are hermetic.
 */
import type { Allocation, Thesis, ThesisProvider } from './thesis';

export const HBM_THESIS: Thesis = {
  claim:
    'HBM memory supply remains tight through the next two quarters, so memory suppliers capture more of the AI hardware margin than the accelerator vendors alone.',
  horizonDays: 180,
  causalChain: [
    'Accelerator demand continues to outrun HBM packaging capacity.',
    'HBM capacity is concentrated in a small number of qualified suppliers, so supply cannot respond quickly.',
    'Contract pricing resets upward at the next negotiation cycle rather than through spot.',
    'Margin accrues to suppliers with qualified HBM lines before it accrues to accelerator vendors.',
  ],
  beneficiaries: [
    {
      entity: 'Micron',
      rationale: 'Qualified HBM supplier with the most direct revenue exposure to a pricing reset.',
      evidence: 'Asserted by the user; no source provided.',
      confidence: 0.7,
      order: 'primary',
    },
    {
      entity: 'SK Hynix',
      rationale: 'Largest HBM share; benefits first from a contract reset.',
      evidence: 'Asserted by the user; no source provided.',
      confidence: 0.75,
      order: 'primary',
    },
    {
      entity: 'SanDisk',
      rationale:
        'Adjacent memory capacity is displaced toward HBM, tightening the rest of the memory market.',
      evidence: 'Inferred from the causal chain, not stated by the user.',
      confidence: 0.45,
      order: 'secondary',
    },
    {
      entity: 'NVIDIA',
      rationale:
        'Volume beneficiary of the same demand, but pays the input cost — exposure is to the demand, not the tightness.',
      evidence: 'Asserted by the user; no source provided.',
      confidence: 0.5,
      order: 'secondary',
    },
  ],
  disconfirmingConditions: [
    {
      statement: 'Memory names sell off hard while the broader AI complex holds up.',
      observable: true,
      trigger: {
        metric: 'drawdownBpsFromEntry',
        comparator: 'gt',
        threshold: 1500,
        appliesTo: ['Micron', 'SK Hynix', 'SanDisk'],
      },
      reasoning:
        'A 15% drawdown concentrated in the memory legs is inconsistent with a tightening thesis; the threshold is roughly one quarter of the sector\'s typical annual range rather than a round number.',
    },
    {
      statement:
        'The on-chain price stops tracking the underlying, so the position no longer expresses the thesis.',
      observable: true,
      trigger: { metric: 'basisBps', comparator: 'gt', threshold: 400, appliesTo: [] },
      reasoning:
        'Beyond 4% the wrapper is pricing something other than the reference security; the position is then a wrapper bet, not a memory bet.',
    },
    {
      statement: 'Liquidity thins to the point the position cannot be exited at a sane price.',
      observable: true,
      trigger: { metric: 'capacityUsdg', comparator: 'lt', threshold: 500, appliesTo: [] },
      reasoning:
        'Below roughly 500 USDG of capacity at the mandate impact limit, exiting costs more than the thesis is likely to earn.',
    },
    {
      statement: 'HBM capacity expansions are announced and qualified faster than expected.',
      observable: false,
      trigger: null,
      reasoning:
        'Capacity qualification is disclosed in company guidance and industry reporting. No metric available to this system measures it, so it stays a manual watch item rather than becoming a proxy that never fires.',
    },
    {
      statement: 'Accelerator demand itself rolls over, removing the pressure on memory.',
      observable: false,
      trigger: null,
      reasoning:
        'Would show up first in order commentary and lead times, not in any price or liquidity metric this system reads. A price-based proxy would trigger long after the thesis was already wrong.',
    },
  ],
  unstatedAssumptions: [
    'That contract pricing, not spot, is the transmission mechanism.',
    'That equity prices reprice on the pricing reset rather than having already discounted it.',
    'That the tokenised wrappers track their underlying closely enough over a six-month horizon.',
  ],
};

const HBM_ALLOCATION: Allocation = {
  legs: [
    {
      symbol: 'wMUx',
      weightBps: 2800,
      expresses: 'Micron',
      rationale: 'Most direct exposure to a contract pricing reset.',
    },
    {
      symbol: 'wSKHYx',
      weightBps: 2800,
      expresses: 'SK Hynix',
      rationale: 'Largest HBM share; first to benefit.',
    },
    {
      symbol: 'wSNDKx',
      weightBps: 1600,
      expresses: 'SanDisk',
      rationale: 'Second-order tightening in adjacent memory.',
    },
    {
      symbol: 'wNVDAx',
      weightBps: 1800,
      expresses: 'NVIDIA',
      rationale: 'Demand-side exposure; pays the input cost, so weighted below the suppliers.',
    },
    {
      symbol: 'wINTCx',
      weightBps: 1000,
      expresses: 'NVIDIA',
      rationale: 'Broader semiconductor beta to dilute single-name risk within the same chain.',
    },
  ],
  unmapped: [],
};

export function fixtureProvider(): ThesisProvider {
  return {
    async compile() {
      return HBM_THESIS;
    },
    async allocate(_thesis, universe) {
      const available = new Set(universe.map((a) => a.symbol));
      const legs = HBM_ALLOCATION.legs.filter((l) => available.has(l.symbol));
      const dropped = HBM_ALLOCATION.legs.filter((l) => !available.has(l.symbol));
      return {
        legs,
        unmapped: [
          ...HBM_ALLOCATION.unmapped,
          ...dropped.map((l) => ({
            entity: l.expresses,
            reason: `${l.symbol} not present in the discovered universe`,
          })),
        ],
      };
    },
  };
}

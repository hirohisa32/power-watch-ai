type OpenAiUsage = {
  model: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

type TokenRates = { input: number; cachedInput: number; output: number };

const RATES_PER_MILLION: Array<[prefix: string, rates: TokenRates]> = [
  ["gpt-6-astra", { input: 5, cachedInput: 0.5, output: 25 }],
  ["gpt-6-sol", { input: 1, cachedInput: 0.1, output: 5 }],
  ["gpt-6-luna", { input: 0.05, cachedInput: 0.005, output: 0.25 }],
  ["gpt-5.4-mini", { input: 0.75, cachedInput: 0.075, output: 4.5 }],
  ["gpt-5.4-nano", { input: 0.2, cachedInput: 0.02, output: 1.25 }],
  ["gpt-5.4", { input: 2.5, cachedInput: 0.25, output: 15 }],
  ["gpt-5-mini", { input: 0.25, cachedInput: 0.025, output: 2 }],
  ["gpt-5-nano", { input: 0.05, cachedInput: 0.005, output: 0.4 }],
  ["gpt-5", { input: 1.25, cachedInput: 0.125, output: 10 }],
];

export function estimateOpenAiCost(usage: OpenAiUsage) {
  if (usage.inputTokens == null || usage.outputTokens == null) return null;
  const entry = RATES_PER_MILLION.find(([prefix]) =>
    new RegExp(`^${prefix.replace(".", "\\.")}(?:-|$)`).test(usage.model),
  );
  if (!entry) return null;
  const rates = entry[1];
  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const uncached = usage.inputTokens - cached;
  return (
    (uncached * rates.input + cached * rates.cachedInput + usage.outputTokens * rates.output) /
    1_000_000
  );
}

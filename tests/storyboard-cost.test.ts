import { describe, expect, it } from "vitest";
import { estimateOpenAiCost } from "@/lib/storyboard/cost";

describe("OpenAI storyboard cost", () => {
  it("calculates gpt-6-sol token cost including cached input", () => {
    expect(
      estimateOpenAiCost({
        model: "gpt-6-sol-2026-09-01",
        inputTokens: 10_000,
        cachedInputTokens: 4_000,
        outputTokens: 2_000,
      }),
    ).toBeCloseTo(0.0164, 8);
  });

  it("returns null for an unknown model", () => {
    expect(
      estimateOpenAiCost({
        model: "future-model",
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
      }),
    ).toBeNull();
  });
});

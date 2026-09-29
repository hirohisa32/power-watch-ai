import { afterEach, describe, expect, it, vi } from "vitest";
import { FrankfurterEcbExchangeRateProvider } from "@/lib/billing/exchange-rate";

describe("ECB参照為替レートProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("MockレスポンスからUSD/JPYと出典日を取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          date: "2026-09-29",
          base: "USD",
          quote: "JPY",
          rate: 149.82,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(new FrankfurterEcbExchangeRateProvider().getUsdJpy()).resolves.toEqual({
      rate: 149.82,
      source: "Frankfurter API / European Central Bank (ECB)",
      publishedAt: new Date("2026-09-29T00:00:00.000Z"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("通貨ペアが異なるレスポンスを拒否する", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ date: "2026-09-29", base: "EUR", quote: "JPY", rate: 173.1 }),
            { status: 200 },
          ),
        ),
    );
    await expect(new FrankfurterEcbExchangeRateProvider().getUsdJpy()).rejects.toThrow(
      "PAIR_MISMATCH",
    );
  });
});

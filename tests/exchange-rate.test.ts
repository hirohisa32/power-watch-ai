import { afterEach, describe, expect, it, vi } from "vitest";
import { EcbExchangeRateProvider } from "@/lib/billing/exchange-rate";

describe("ECB参照為替レートProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Mock XMLからUSD/JPYクロスレートと出典日を取得する", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<Cube><Cube time='2026-09-29'><Cube currency='USD' rate='1.2000'/><Cube currency='JPY' rate='180.00'/></Cube></Cube>",
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(new EcbExchangeRateProvider().getUsdJpy()).resolves.toEqual({
      rate: 150,
      source: "European Central Bank (ECB) euro foreign exchange reference rates",
      publishedAt: new Date("2026-09-29T00:00:00.000Z"),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("必要通貨が欠けたレスポンスを拒否する", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            "<Cube><Cube time='2026-09-29'><Cube currency='JPY' rate='173.1'/></Cube></Cube>",
            { status: 200 },
          ),
        ),
    );
    await expect(new EcbExchangeRateProvider().getUsdJpy()).rejects.toThrow("RESPONSE_INVALID");
  });
});

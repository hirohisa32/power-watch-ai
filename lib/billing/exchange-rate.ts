export type ExchangeRateQuote = {
  rate: number;
  source: string;
  publishedAt: Date;
};

export interface ExchangeRateProvider {
  getUsdJpy(): Promise<ExchangeRateQuote>;
}

export class EcbExchangeRateProvider implements ExchangeRateProvider {
  async getUsdJpy(): Promise<ExchangeRateQuote> {
    const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", {
      headers: { accept: "application/xml,text/xml" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`EXCHANGE_RATE_HTTP_${response.status}`);
    const xml = await response.text();
    const publishedDate = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
    const usdPerEur = readEcbCurrencyRate(xml, "USD");
    const jpyPerEur = readEcbCurrencyRate(xml, "JPY");
    if (!publishedDate || !usdPerEur || !jpyPerEur)
      throw new Error("EXCHANGE_RATE_RESPONSE_INVALID");
    const rate = Math.round((jpyPerEur / usdPerEur) * 1_000_000) / 1_000_000;
    return {
      rate,
      source: "European Central Bank (ECB) euro foreign exchange reference rates",
      publishedAt: new Date(`${publishedDate}T00:00:00.000Z`),
    };
  }
}

function readEcbCurrencyRate(xml: string, currency: string) {
  const match = xml.match(
    new RegExp(`<Cube\\s+currency=['"]${currency}['"]\\s+rate=['"]([0-9.]+)['"]`),
  );
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

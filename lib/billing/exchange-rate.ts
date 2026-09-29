import { z } from "zod";

export type ExchangeRateQuote = {
  rate: number;
  source: string;
  publishedAt: Date;
};

export interface ExchangeRateProvider {
  getUsdJpy(): Promise<ExchangeRateQuote>;
}

const responseSchema = z.object({
  date: z.string().date(),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive(),
});

export class FrankfurterEcbExchangeRateProvider implements ExchangeRateProvider {
  async getUsdJpy(): Promise<ExchangeRateQuote> {
    const response = await fetch("https://api.frankfurter.dev/v2/providers/ecb/rate/usd/jpy", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`EXCHANGE_RATE_HTTP_${response.status}`);
    const quote = responseSchema.parse(await response.json());
    if (quote.base.toUpperCase() !== "USD" || quote.quote.toUpperCase() !== "JPY")
      throw new Error("EXCHANGE_RATE_PAIR_MISMATCH");
    return {
      rate: quote.rate,
      source: "Frankfurter API / European Central Bank (ECB)",
      publishedAt: new Date(`${quote.date}T00:00:00.000Z`),
    };
  }
}

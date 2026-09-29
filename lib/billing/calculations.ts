export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function roundJpy(usd: number, usdJpyRate: number) {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("USD金額が不正です");
  if (!Number.isFinite(usdJpyRate) || usdJpyRate <= 0) throw new Error("為替レートが不正です");
  return Math.round((usd + Number.EPSILON) * usdJpyRate);
}

export function jstBillingMonth(date: Date) {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextBillingMonth(month: string) {
  assertBillingMonth(month);
  const [year, value] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, value, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resolveOpenBillingMonth(date: Date, isClosed: (month: string) => boolean) {
  let month = jstBillingMonth(date);
  while (isClosed(month)) month = nextBillingMonth(month);
  return month;
}

export function summarizeBillingMonth(
  entries: Array<{ projectId: string; incrementalCostJpy: number }>,
) {
  return {
    totalJpy: entries.reduce((sum, entry) => sum + entry.incrementalCostJpy, 0),
    projectCount: new Set(entries.map((entry) => entry.projectId)).size,
  };
}

export function billingMonthRangeJst(month: string) {
  assertBillingMonth(month);
  const [year, value] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, value - 1, 1) - JST_OFFSET_MS);
  const endExclusive = new Date(Date.UTC(year, value, 1) - JST_OFFSET_MS);
  return { start, endExclusive };
}

export function applyIncrementalCost(input: {
  previousTotalUsd: number;
  currentTotalUsd: number;
  previousTotalJpy: number;
  usdJpyRate: number;
}) {
  const incrementalUsd = Math.max(0, roundUsd(input.currentTotalUsd - input.previousTotalUsd));
  const incrementalJpy = roundJpy(incrementalUsd, input.usdJpyRate);
  return {
    incrementalUsd,
    incrementalJpy,
    totalJpy: input.previousTotalJpy + incrementalJpy,
  };
}

export function assertBillingMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("請求月が不正です");
}

export function roundUsd(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

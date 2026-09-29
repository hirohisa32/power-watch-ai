import { describe, expect, it } from "vitest";
import {
  applyIncrementalCost,
  billingMonthRangeJst,
  jstBillingMonth,
  resolveOpenBillingMonth,
  roundJpy,
  summarizeBillingMonth,
} from "@/lib/billing/calculations";

describe("請求用コスト確定", () => {
  it("USDを確定レートで1円単位に四捨五入する", () => {
    expect(roundJpy(4.8258, 149.82)).toBe(723);
  });

  it("保存済みの円金額は後日の為替変動から独立する", () => {
    const fixed = roundJpy(4.8258, 149.82);
    expect(fixed).toBe(723);
    expect(fixed).not.toBe(roundJpy(4.8258, 155.5));
  });

  it("再生成分だけを追加し過去の確定円を保持する", () => {
    expect(
      applyIncrementalCost({
        previousTotalUsd: 4,
        currentTotalUsd: 5.25,
        previousTotalJpy: 600,
        usdJpyRate: 150,
      }),
    ).toEqual({
      incrementalUsd: 1.25,
      incrementalJpy: 188,
      totalJpy: 788,
    });
  });

  it("動画重複を除いて月別金額と本数を集計する", () => {
    expect(
      summarizeBillingMonth([
        { projectId: "a", incrementalCostJpy: 700 },
        { projectId: "a", incrementalCostJpy: 100 },
        { projectId: "b", incrementalCostJpy: 500 },
      ]),
    ).toEqual({ totalJpy: 1300, projectCount: 2 });
  });

  it("JSTの月境界で請求月を判定する", () => {
    expect(jstBillingMonth(new Date("2026-08-31T14:59:59.999Z"))).toBe("2026-08");
    expect(jstBillingMonth(new Date("2026-08-31T15:00:00.000Z"))).toBe("2026-09");
    expect(billingMonthRangeJst("2026-09")).toEqual({
      start: new Date("2026-08-31T15:00:00.000Z"),
      endExclusive: new Date("2026-09-30T15:00:00.000Z"),
    });
  });

  it("締め後の追加費用を次の未締め月へ送る", () => {
    expect(
      resolveOpenBillingMonth(new Date("2026-09-30T12:00:00.000Z"), (month) => month === "2026-09"),
    ).toBe("2026-10");
  });

  it("月締めスナップショットは後続明細から変化しない", () => {
    const September = summarizeBillingMonth([{ projectId: "a", incrementalCostJpy: 723 }]);
    const laterEntries = [{ projectId: "a", incrementalCostJpy: 100 }];
    expect(September).toEqual({ totalJpy: 723, projectCount: 1 });
    expect(summarizeBillingMonth(laterEntries).totalJpy).toBe(100);
  });
});

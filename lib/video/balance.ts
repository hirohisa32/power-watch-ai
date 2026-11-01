import "server-only";
import { getRunwayAccountStatus } from "./runway";

export class RunwayBalanceError extends Error {
  readonly code = "INSUFFICIENT_CREDITS";
  constructor(
    public readonly requiredCredits: number,
    public readonly availableCredits: number,
  ) {
    super("現在Runway残高が不足しています。自動補充設定をご確認ください。");
    this.name = "RunwayBalanceError";
  }
}

export async function ensureRunwayCredits(
  requiredCredits: number,
  readStatus: typeof getRunwayAccountStatus = getRunwayAccountStatus,
) {
  if (requiredCredits <= 0) return { requiredCredits: 0, availableCredits: null };
  const status = await readStatus();
  if (status.creditBalance < requiredCredits)
    throw new RunwayBalanceError(requiredCredits, status.creditBalance);
  return { requiredCredits, availableCredits: status.creditBalance };
}

export function runwayBalanceWarning(balance: number, creditsPerScene = 60) {
  const scenes = Math.floor(balance / creditsPerScene);
  return {
    low: balance < 1_200,
    balance,
    approximateScenes: scenes,
  };
}

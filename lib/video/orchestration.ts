import type { ProviderTaskStatus } from "./types";

export type JobAction =
  | { type: "poll" }
  | { type: "complete"; outputUrl: string }
  | { type: "retry" }
  | { type: "fail"; code: string; message: string };

export function decideJobAction(
  status: ProviderTaskStatus,
  attempts: number,
  maxRetries: number,
): JobAction {
  if (status.status === "pending" || status.status === "running") return { type: "poll" };
  if (status.status === "succeeded") return { type: "complete", outputUrl: status.outputUrl };
  if (status.status === "failed" && status.retryable && attempts < maxRetries)
    return { type: "retry" };
  return {
    type: "fail",
    code: status.status === "canceled" ? "CANCELED" : status.code || "FAILED",
    message: status.message,
  };
}

export function nextGenerationVersion(versions: number[]) {
  return Math.max(0, ...versions) + 1;
}

export function shouldGenerateMissing(statuses: string[]) {
  return !statuses.some((status) => ["queued", "generating", "completed"].includes(status));
}

export function generationObjectKey(projectId: string, sceneId: string, generationId: string) {
  return `projects/${projectId}/scenes/${sceneId}/generations/${generationId}.mp4`;
}

export function pickReferenceAssetIds(
  assets: Array<{ id: string; label: string }>,
  preferredLabels: string[],
  preset?: string,
) {
  const labelOrder = preferredLabels.length ? preferredLabels : preferredLabelOrder(preset);
  return assets
    .map((asset, index) => ({
      asset,
      index,
      rank: labelRank(asset.label, labelOrder, preset),
    }))
    .filter(({ rank }) => !preferredLabels.length || rank < 1000)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ asset }) => asset.id);
}

export function generationModeForScene(referenceAssetIds: string[]) {
  return referenceAssetIds.length ? "image-to-video" : "text-to-video";
}

function preferredLabelOrder(preset?: string) {
  if (preset === "WristShot") return ["wrist", "45", "front"];
  if (preset === "WatchMacro") return ["dial macro", "macro", "side", "caseback", "front"];
  return ["front", "45", "dial macro", "wrist", "side", "caseback"];
}

function labelRank(label: string, order: string[], preset?: string) {
  const normalized = label.trim().toLocaleLowerCase();
  const exact = order.findIndex((candidate) => normalized === candidate.toLocaleLowerCase());
  if (exact >= 0) return exact;
  const partial = order.findIndex(
    (candidate) =>
      normalized.includes(candidate.toLocaleLowerCase()) ||
      candidate.toLocaleLowerCase().includes(normalized),
  );
  if (partial >= 0) return partial + 100;
  return preset ? 500 : 1000;
}

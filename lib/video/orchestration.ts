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
) {
  const preferred = preferredLabels.length
    ? assets.filter((asset) => preferredLabels.includes(asset.label))
    : assets;
  return preferred.map((asset) => asset.id);
}

export type RenderState = "queued" | "rendering" | "completed" | "failed";
export type RenderEvent = "start" | "complete" | "fail";

export function nextRenderState(current: RenderState, event: RenderEvent): RenderState {
  if (current === "queued" && event === "start") return "rendering";
  if (current === "rendering" && event === "complete") return "completed";
  if ((current === "queued" || current === "rendering") && event === "fail") return "failed";
  return current;
}

export function canRetryRender(status: RenderState) {
  return status === "failed" || status === "completed";
}

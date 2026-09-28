import RunwayML from "@runwayml/sdk";
import type { VideoGenerationInput, VideoProvider } from "./types";
import { VideoProviderError } from "./types";

type RunwayClient = Pick<RunwayML, "imageToVideo" | "textToVideo" | "tasks">;

export class RunwayVideoProvider implements VideoProvider {
  readonly name = "runway";
  constructor(private readonly client: RunwayClient = createClient()) {}

  async generate(input: VideoGenerationInput) {
    try {
      if (input.model !== "gen4.5") {
        throw new VideoProviderError(
          `Unsupported configured Runway model: ${input.model}`,
          false,
          "UNSUPPORTED_MODEL",
        );
      }
      const common = {
        model: "gen4.5" as const,
        promptText: input.prompt,
        duration: input.duration,
        ratio: input.ratio,
        outputFormat: "mp4" as const,
      };
      const task = input.referenceImageUrl
        ? await this.client.imageToVideo.create({
            ...common,
            promptImage: input.referenceImageUrl,
          })
        : await this.client.textToVideo.create(common);
      return { taskId: task.id, estimatedCostCredits: task.estimatedCost?.credits };
    } catch (error) {
      throw normalizeRunwayError(error);
    }
  }

  async getStatus(taskId: string) {
    try {
      const task = await this.client.tasks.retrieve(taskId);
      if (task.status === "PENDING" || task.status === "THROTTLED") {
        return {
          status: "pending" as const,
          estimatedCostCredits: task.estimatedCost?.credits,
        };
      }
      if (task.status === "RUNNING") {
        return {
          status: "running" as const,
          progress: task.progress,
          estimatedCostCredits: task.estimatedCost?.credits,
        };
      }
      if (task.status === "SUCCEEDED") {
        const outputUrl = task.output[0];
        if (!outputUrl)
          throw new VideoProviderError("Runway returned no video URL", false, "NO_OUTPUT");
        return {
          status: "succeeded" as const,
          outputUrl,
          actualCostCredits: task.cost?.credits,
        };
      }
      if (task.status === "CANCELLED") {
        return {
          status: "canceled" as const,
          message: "Runway task was canceled",
          retryable: false,
          actualCostCredits: task.cost?.credits,
        };
      }
      return {
        status: "failed" as const,
        code: task.failureCode,
        message: task.failure,
        retryable: isRetryableFailureCode(task.failureCode),
        actualCostCredits: task.cost?.credits,
      };
    } catch (error) {
      throw normalizeRunwayError(error);
    }
  }

  async cancel(taskId: string) {
    try {
      await this.client.tasks.delete(taskId);
    } catch (error) {
      throw normalizeRunwayError(error);
    }
  }
}

function createClient() {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey)
    throw new VideoProviderError("RUNWAY_API_KEY is not configured", false, "NOT_CONFIGURED");
  return new RunwayML({ apiKey, timeout: 30_000, maxRetries: 2 });
}

export function isRetryableFailureCode(code?: string) {
  return (
    !code ||
    code === "INTERNAL" ||
    code.startsWith("INPUT_PREPROCESSING.INTERNAL") ||
    code.startsWith("THIRD_PARTY.UNAVAILABLE")
  );
}

function normalizeRunwayError(error: unknown) {
  if (error instanceof VideoProviderError) return error;
  const status =
    typeof error === "object" && error && "status" in error ? Number(error.status) : undefined;
  const retryable = status === 429 || status === 502 || status === 503 || status === 504;
  const message = error instanceof Error ? error.message : "Runway request failed";
  if (/enough credits/i.test(message)) {
    return new VideoProviderError(
      "Runway creditsが不足しています。管理者へ追加を依頼してください。",
      false,
      "INSUFFICIENT_CREDITS",
    );
  }
  return new VideoProviderError(message, retryable, status ? `HTTP_${status}` : "RUNWAY_ERROR");
}

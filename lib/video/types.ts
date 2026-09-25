export type VideoGenerationInput = {
  model: string;
  prompt: string;
  duration: number;
  ratio: "1280:720" | "720:1280";
  referenceImageUrl?: string;
};

export type ProviderTaskStatus =
  | { status: "pending"; estimatedCostCredits?: number }
  | { status: "running"; progress?: number; estimatedCostCredits?: number }
  | { status: "succeeded"; outputUrl: string; actualCostCredits?: number }
  | {
      status: "failed";
      code?: string;
      message: string;
      retryable: boolean;
      actualCostCredits?: number;
    }
  | {
      status: "canceled";
      code?: string;
      message: string;
      retryable: boolean;
      actualCostCredits?: number;
    };

export interface VideoProvider {
  readonly name: string;
  generate(input: VideoGenerationInput): Promise<{
    taskId: string;
    estimatedCostCredits?: number;
  }>;
  getStatus(taskId: string): Promise<ProviderTaskStatus>;
  cancel?(taskId: string): Promise<void>;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code = "PROVIDER_ERROR",
  ) {
    super(message);
    this.name = "VideoProviderError";
  }
}

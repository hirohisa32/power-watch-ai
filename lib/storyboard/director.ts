import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { storyboardOutputSchema, type StoryboardOutput } from "@/lib/storyboard/schema";

export type StoryboardDirectorInput = {
  system: string;
  user: string;
};

export type StoryboardDirectorResult = {
  storyboard: StoryboardOutput;
  usage: {
    model: string;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    requestId: string | null;
    durationMs: number;
  };
};

export interface StoryboardDirector {
  generate(input: StoryboardDirectorInput): Promise<StoryboardDirectorResult>;
}

export class StoryboardDirectorError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "authentication"
      | "rate_limit"
      | "timeout"
      | "invalid_response"
      | "provider",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoryboardDirectorError";
  }
}

export class OpenAIStoryboardDirector implements StoryboardDirector {
  async generate(input: StoryboardDirectorInput): Promise<StoryboardDirectorResult> {
    if (!process.env.OPENAI_API_KEY)
      throw new StoryboardDirectorError("configuration", "OPENAI_API_KEY is not configured");
    const model = process.env.OPENAI_MODEL ?? "gpt-6-sol";
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60_000,
      maxRetries: 2,
    });
    const startedAt = Date.now();
    try {
      const { data: response, request_id: requestId } = await openai.responses
        .parse(
          {
            model,
            store: false,
            input: [
              { role: "developer", content: input.system },
              { role: "user", content: input.user },
            ],
            text: { format: zodTextFormat(storyboardOutputSchema, "watch_storyboard") },
            max_output_tokens: 16_000,
          },
          { signal: AbortSignal.timeout(65_000) },
        )
        .withResponse();
      if (!response.output_parsed)
        throw new StoryboardDirectorError("invalid_response", "Structured response was empty");
      return {
        storyboard: response.output_parsed,
        usage: {
          model: response.model ?? model,
          inputTokens: response.usage?.input_tokens ?? null,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          requestId: requestId ?? null,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (error) {
      if (error instanceof StoryboardDirectorError) throw error;
      if (error instanceof OpenAI.APIError) {
        if (error.status === 401)
          throw new StoryboardDirectorError("authentication", error.message, error);
        if (error.status === 429)
          throw new StoryboardDirectorError("rate_limit", error.message, error);
        throw new StoryboardDirectorError("provider", error.message, error);
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
        throw new StoryboardDirectorError("timeout", error.message, error);
      throw new StoryboardDirectorError(
        "invalid_response",
        "OpenAI response could not be parsed",
        error,
      );
    }
  }
}

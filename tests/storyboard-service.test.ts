import { describe, expect, it, vi } from "vitest";
import type { StoryboardDirector } from "@/lib/storyboard/director";
import type { StoryboardPersistence } from "@/lib/storyboard/repository";
import { generateAndSaveStoryboard } from "@/lib/storyboard/service";
import { storyboardFixture } from "./fixtures/storyboard";

describe("storyboard save flow", () => {
  it("validates generated output before atomically replacing DB records", async () => {
    const replace = vi.fn(async (input: Parameters<StoryboardPersistence["replace"]>[0]) => {
      expect(input.projectId).toBe("project-1");
      return { storyboardId: "storyboard-2", version: 2 };
    });
    const persistence: StoryboardPersistence = { replace, recordUsage: vi.fn() };
    const director: StoryboardDirector = {
      generate: vi.fn(async () => ({
        storyboard: storyboardFixture(60),
        usage: {
          model: "mock-model",
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 200,
          requestId: "req_test",
          durationMs: 20,
        },
      })),
    };
    const result = await generateAndSaveStoryboard(
      {
        projectId: "project-1",
        script: "A sufficiently detailed watch history script for testing.",
        style: "cinematic_real",
        language: "en",
        targetDuration: 60,
        assetLabels: [],
      },
      director,
      persistence,
    );
    expect(result).toEqual({
      storyboardId: "storyboard-2",
      version: 2,
      totalDuration: 60,
      sceneCount: 12,
    });
    expect(replace).toHaveBeenCalledOnce();
    expect(replace.mock.calls[0][0].storyboard.scenes).toHaveLength(12);
  });

  it("records provider usage when generated output fails validation", async () => {
    const invalid = storyboardFixture(60);
    invalid.scenes[0].preset = "HistoricalEvent";
    const usage = {
      model: "mock-model",
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 200,
      requestId: "req_failed",
      durationMs: 20,
    };
    const director: StoryboardDirector = {
      generate: vi.fn(async () => ({ storyboard: invalid, usage })),
    };
    const replace = vi.fn();
    const recordUsage = vi.fn(async () => undefined);
    const persistence: StoryboardPersistence = { replace, recordUsage };

    await expect(
      generateAndSaveStoryboard(
        {
          projectId: "project-1",
          script: "A sufficiently detailed watch history script for testing.",
          style: "cinematic_real",
          language: "en",
          targetDuration: 60,
          assetLabels: ["Front"],
        },
        director,
        persistence,
      ),
    ).rejects.toThrow("Opening");
    expect(replace).not.toHaveBeenCalled();
    expect(recordUsage).toHaveBeenCalledWith({
      projectId: "project-1",
      operation: "storyboard_generation_failed",
      usage,
    });
  });
});

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
    const persistence: StoryboardPersistence = { replace };
    const director: StoryboardDirector = {
      generate: vi.fn(async () => ({
        storyboard: storyboardFixture(60),
        usage: {
          model: "mock-model",
          inputTokens: 100,
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
});

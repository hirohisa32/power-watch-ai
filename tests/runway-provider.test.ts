import { describe, expect, it, vi } from "vitest";
import { isRetryableFailureCode, RunwayVideoProvider } from "@/lib/video/runway";

function providerWith(client: object) {
  return new RunwayVideoProvider(client as never);
}

describe("Runway provider adapter", () => {
  it("submits a Gen-4.5 image-to-video task with scene duration", async () => {
    const create = vi.fn().mockResolvedValue({ id: "task-1", estimatedCost: { credits: 60 } });
    const provider = providerWith({ imageToVideo: { create }, textToVideo: {}, tasks: {} });
    await expect(
      provider.generate({
        model: "gen4.5",
        prompt: "watch prompt",
        duration: 5,
        ratio: "720:1280",
        referenceImageUrl: "https://assets.example/watch.jpg",
      }),
    ).resolves.toEqual({ taskId: "task-1", estimatedCostCredits: 60 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gen4.5",
        promptImage: "https://assets.example/watch.jpg",
        promptText: "watch prompt",
        duration: 5,
        outputFormat: "mp4",
      }),
    );
  });

  it("routes scenes without a reference image through text-to-video", async () => {
    const textCreate = vi
      .fn()
      .mockResolvedValue({ id: "task-text", estimatedCost: { credits: 48 } });
    const imageCreate = vi.fn();
    const provider = providerWith({
      imageToVideo: { create: imageCreate },
      textToVideo: { create: textCreate },
      tasks: {},
    });
    await expect(
      provider.generate({
        model: "gen4.5",
        prompt: "period workshop",
        duration: 4,
        ratio: "720:1280",
      }),
    ).resolves.toEqual({ taskId: "task-text", estimatedCostCredits: 48 });
    expect(textCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gen4.5",
        promptText: "period workshop",
        ratio: "720:1280",
      }),
    );
    expect(imageCreate).not.toHaveBeenCalled();
  });

  it("parses Runway pending, success and failure responses", async () => {
    const retrieve = vi
      .fn()
      .mockResolvedValueOnce({ status: "PENDING", estimatedCost: { credits: 36 } })
      .mockResolvedValueOnce({
        status: "SUCCEEDED",
        output: ["https://output.example/video.mp4"],
        cost: { credits: 35 },
      })
      .mockResolvedValueOnce({
        status: "FAILED",
        failureCode: "ASSET.INVALID",
        failure: "invalid input",
        cost: { credits: 0 },
      });
    const provider = providerWith({ imageToVideo: {}, textToVideo: {}, tasks: { retrieve } });
    await expect(provider.getStatus("task")).resolves.toEqual({
      status: "pending",
      estimatedCostCredits: 36,
    });
    await expect(provider.getStatus("task")).resolves.toEqual({
      status: "succeeded",
      outputUrl: "https://output.example/video.mp4",
      actualCostCredits: 35,
    });
    await expect(provider.getStatus("task")).resolves.toEqual({
      status: "failed",
      code: "ASSET.INVALID",
      message: "invalid input",
      retryable: false,
      actualCostCredits: 0,
    });
  });

  it("only marks official transient task failures retryable", () => {
    expect(isRetryableFailureCode("INTERNAL")).toBe(true);
    expect(isRetryableFailureCode("THIRD_PARTY.UNAVAILABLE")).toBe(true);
    expect(isRetryableFailureCode("SAFETY.INPUT.TEXT")).toBe(false);
    expect(isRetryableFailureCode("ASSET.INVALID")).toBe(false);
  });
});

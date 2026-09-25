import RunwayML from "@runwayml/sdk";

async function main() {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) throw new Error("RUNWAY_API_KEY is required. This script makes one paid request.");
  const model = process.env.VIDEO_MODEL_CINEMATIC || "gen4.5";
  if (model !== "gen4.5")
    throw new Error("test:runway currently verifies the official gen4.5 path only");
  console.log(
    "PAID MANUAL TEST: submitting exactly one 3-second Gen-4.5 scene (36 credits at current pricing).",
  );
  const client = new RunwayML({ apiKey, timeout: 30_000, maxRetries: 2 });
  const task = await client.imageToVideo.create({
    model: "gen4.5",
    promptImage: undefined as unknown as string,
    promptText:
      "A restrained cinematic macro study of precision watchmaking tools on a dark walnut desk, slow controlled push-in, warm motivated side light, no logos, no text.",
    ratio: "1280:720",
    duration: 3,
    outputFormat: "mp4",
  });
  console.log(
    `Task ${task.id} submitted. Estimated credits: ${task.estimatedCost.credits}. Polling every 5+ seconds.`,
  );
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    const status = await client.tasks.retrieve(task.id);
    console.log(`Status: ${status.status}`);
    if (status.status === "SUCCEEDED") {
      console.log(`Succeeded. Ephemeral output (download within 24-48h): ${status.output[0]}`);
      return;
    }
    if (status.status === "FAILED" || status.status === "CANCELLED") {
      throw new Error(`Runway task ended with ${status.status}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

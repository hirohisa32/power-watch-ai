import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import type { FinalRenderQueueMessage } from "@/lib/render/queue";
import { processFinalRenderJob } from "@/lib/render/worker";

export const runtime = "nodejs";
// A full 1080x1920 composition can legitimately take longer than the default
// five-minute Function limit once Opening, Ending, subtitles and audio mixing
// are included. Keep the queue lease longer than the Function execution window
// so the same render is not redelivered while FFmpeg is still running.
export const maxDuration = 800;
const messageSchema = z.object({ jobId: z.string().uuid() });

const queueHandler = handleCallback<FinalRenderQueueMessage>(
  async (raw) => {
    const message = messageSchema.parse(raw);
    await processFinalRenderJob(message.jobId);
  },
  { visibilityTimeoutSeconds: 900, retry: () => undefined },
);

export async function POST(request: Request) {
  return queueHandler(request);
}

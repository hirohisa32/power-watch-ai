import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import type { FinalRenderQueueMessage } from "@/lib/render/queue";
import { processFinalRenderJob } from "@/lib/render/worker";

export const runtime = "nodejs";
export const maxDuration = 300;
const messageSchema = z.object({ jobId: z.string().uuid() });

const queueHandler = handleCallback<FinalRenderQueueMessage>(
  async (raw) => {
    const message = messageSchema.parse(raw);
    await processFinalRenderJob(message.jobId);
  },
  { visibilityTimeoutSeconds: 300, retry: () => undefined },
);

export async function POST(request: Request) {
  return queueHandler(request);
}

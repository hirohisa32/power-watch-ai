import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { videoConfig } from "@/lib/video/config";
import type { VideoQueueMessage } from "@/lib/video/queue";
import { markQueueDeliveryExhausted, processVideoJob } from "@/lib/video/worker";

export const runtime = "nodejs";
export const maxDuration = 120;
const messageSchema = z.object({ jobId: z.string().uuid(), cycle: z.number().int().min(0) });

const queueHandler = handleCallback<VideoQueueMessage>(
  async (raw, metadata) => {
    const message = messageSchema.parse(raw);
    try {
      await processVideoJob(message.jobId, message.cycle);
    } catch (error) {
      if (metadata.deliveryCount >= videoConfig().maxRetries) {
        await markQueueDeliveryExhausted(
          message.jobId,
          error instanceof Error ? error.message : "Queue delivery failed",
        );
        return;
      }
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 120,
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(120, 5 * 2 ** Math.max(0, metadata.deliveryCount - 1)),
    }),
  },
);

// Keep the exported App Router signature narrow for Next.js route type generation.
export async function POST(request: Request) {
  return queueHandler(request);
}

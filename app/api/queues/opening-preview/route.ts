import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { processOpeningPreviewJob } from "@/lib/opening/worker";
import type { OpeningPreviewQueueMessage } from "@/lib/opening/queue";

export const maxDuration = 300;
export const runtime = "nodejs";
const schema = z.object({ jobId: z.string().uuid(), cycle: z.number().int().min(0) });

const handler = handleCallback<OpeningPreviewQueueMessage>(
  async (raw) => {
    const message = schema.parse(raw);
    await processOpeningPreviewJob(message.jobId, message.cycle);
  },
  { visibilityTimeoutSeconds: 300 },
);

export async function POST(request: Request) {
  return handler(request);
}

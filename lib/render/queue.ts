import { send } from "@vercel/queue";

export const FINAL_RENDER_QUEUE_TOPIC = "final-render";
export type FinalRenderQueueMessage = { jobId: string };

export interface FinalRenderJobQueue {
  enqueue(message: FinalRenderQueueMessage): Promise<void>;
}

export class VercelFinalRenderJobQueue implements FinalRenderJobQueue {
  async enqueue(message: FinalRenderQueueMessage) {
    await send(FINAL_RENDER_QUEUE_TOPIC, message, {
      retentionSeconds: 24 * 60 * 60,
      idempotencyKey: message.jobId,
    });
  }
}

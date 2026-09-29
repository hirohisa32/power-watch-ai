import { send } from "@vercel/queue";

export const OPENING_PREVIEW_QUEUE_TOPIC = "opening-preview";
export type OpeningPreviewQueueMessage = { jobId: string; cycle: number };

export interface OpeningPreviewJobQueue {
  enqueue(message: OpeningPreviewQueueMessage, delaySeconds?: number): Promise<void>;
}

export class VercelOpeningPreviewJobQueue implements OpeningPreviewJobQueue {
  async enqueue(message: OpeningPreviewQueueMessage, delaySeconds = 0) {
    await send(OPENING_PREVIEW_QUEUE_TOPIC, message, {
      delaySeconds,
      retentionSeconds: 24 * 60 * 60,
      idempotencyKey: `${message.jobId}:${message.cycle}`,
    });
  }
}

import { send } from "@vercel/queue";

export const VIDEO_QUEUE_TOPIC = "video-generation";
export type VideoQueueMessage = { jobId: string; cycle: number };

export interface VideoJobQueue {
  enqueue(message: VideoQueueMessage, delaySeconds?: number): Promise<void>;
}

export class VercelVideoJobQueue implements VideoJobQueue {
  async enqueue(message: VideoQueueMessage, delaySeconds = 0) {
    await send(VIDEO_QUEUE_TOPIC, message, {
      delaySeconds,
      retentionSeconds: 24 * 60 * 60,
      idempotencyKey: `${message.jobId}:${message.cycle}`,
    });
  }
}

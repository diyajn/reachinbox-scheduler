import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export const EMAIL_QUEUE_NAME = "email-send-queue";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    // Keep failed/completed jobs around briefly so the Bull Board dashboard
    // has something to show; tune down in real production.
    removeOnComplete: 500,
    removeOnFail: 1000,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

/**
 * Enqueue a delayed job for an EmailJob DB row.
 *
 * IDEMPOTENCY: we use the DB row's id as the BullMQ jobId. BullMQ guarantees
 * a job with a given jobId can only exist once in the queue - if this function
 * is ever called twice for the same emailJobId (e.g. a retried API request,
 * or a restart-recovery pass finding a row it already scheduled), BullMQ
 * simply no-ops the second add instead of creating a duplicate job. That's
 * what prevents double-sends.
 */
export async function scheduleEmailJob(emailJobId: string, sendAt: Date) {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  const job = await emailQueue.add(
    "send-email",
    { emailJobId },
    {
      jobId: emailJobId, // <-- idempotency key
      delay,
    }
  );
  return job;
}

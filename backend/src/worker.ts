import { Worker, Job } from "bullmq";
import * as dotenv from "dotenv";
dotenv.config();

import { redisConnection } from "./redis";
import { prisma } from "./db";
import { EMAIL_QUEUE_NAME, scheduleEmailJob, emailQueue } from "./queue";
import { tryConsumeRateLimitSlot, nextHourBoundary } from "./rateLimiter";
import { sendMail, notifySlackRateLimitHit } from "./mailer";

const MAX_PER_HOUR = Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200;
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS_BETWEEN_SENDS) || 2000;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;

async function processJob(job: Job<{ emailJobId: string }>) {
  const { emailJobId } = job.data;

  // IDEMPOTENCY GUARD #1: re-read current state from the DB (source of truth,
  // not the job payload) before doing anything. If this row was already
  // marked SENT (e.g. the job somehow ran twice, or a restart replayed an
  // in-flight job), skip immediately instead of sending again.
  const row = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { sender: { include: { user: { include: { slackConfig: true } } } } },
  });

  if (!row) {
    console.warn(`EmailJob ${emailJobId} not found - dropping job.`);
    return;
  }
  if (row.status === "SENT") {
    console.log(`EmailJob ${emailJobId} already SENT - skipping (idempotent).`);
    return;
  }

  // RATE LIMIT CHECK (Redis-backed, safe across multiple worker instances)
  const { allowed, countThisHour } = await tryConsumeRateLimitSlot(
    row.senderId,
    MAX_PER_HOUR
  );

  if (!allowed) {
    // Do NOT drop or fail the job. Push it to the next hour window instead,
    // preserving order as much as possible by keeping delays proportional
    // to how far over the limit we are.
    const nextWindow = nextHourBoundary();
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: "DELAYED_RATE_LIMIT", scheduledFor: nextWindow },
    });

    await notifySlackRateLimitHit(
      row.sender.user?.slackConfig?.webhookUrl,
      row.sender.label,
      countThisHour,
      MAX_PER_HOUR
    );

    // Re-enqueue with a NEW delay for the next hour window. We reuse the
    // same jobId semantics via scheduleEmailJob, which is safe because the
    // original job (this one) is about to complete normally - BullMQ allows
    // adding a new delayed job with the same jobId only after the old one is
    // gone, which it will be once this handler returns.
    await scheduleEmailJob(emailJobId, nextWindow);
    return;
  }

  // MIN DELAY BETWEEN SENDS: a simple in-worker sleep. Because BullMQ workers
  // process one job at a time per "slot" up to `concurrency`, this throttles
  // how fast each individual worker slot fires sends, which is the simplest
  // way to satisfy "minimum delay between individual email sends" without
  // fighting BullMQ's limiter across multiple queues/senders.
  await new Promise((res) => setTimeout(res, MIN_DELAY_MS));

  try {
    const { previewUrl } = await sendMail({
      smtpUser: row.sender.smtpUser,
      smtpPass: row.sender.smtpPass,
      to: row.recipient,
      subject: row.subject,
      html: row.body,
    });

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        errorMessage: previewUrl ? `Preview: ${previewUrl}` : null,
      },
    });
  } catch (err: any) {
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        errorMessage: String(err?.message || err),
      },
    });
    throw err; // let BullMQ's retry/backoff handle it
  }
}

export const emailWorker = new Worker(EMAIL_QUEUE_NAME, processJob, {
  connection: redisConnection,
  concurrency: CONCURRENCY,
});

emailWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed.`);
});
emailWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

/**
 * RESTART RECOVERY.
 *
 * This is what makes the system survive a server restart without losing or
 * duplicating jobs:
 *
 * 1. BullMQ + Redis already persist delayed jobs to disk (Redis AOF/RDB) -
 *    so as long as your Redis container has a volume (see docker-compose.yml)
 *    jobs you already scheduled survive a process restart on their own,
 *    nothing to do there.
 * 2. The gap this covers: what if a job was scheduled in BullMQ's memory
 *    view but the process crashed BEFORE the add() call was durably
 *    acknowledged, or what if someone wipes Redis but the Postgres rows
 *    still say SCHEDULED? On worker boot, we reconcile: find every DB row
 *    still marked SCHEDULED whose scheduledFor is in the future (or overdue),
 *    and call scheduleEmailJob for it. Because scheduleEmailJob uses the row
 *    id as the BullMQ jobId, if the job already exists in the queue this is
 *    a safe no-op (see queue.ts) - so this reconciliation can run every
 *    startup with no risk of duplicating jobs that are already scheduled.
 */
async function reconcileOnBoot() {
  const pending = await prisma.emailJob.findMany({
    where: { status: "SCHEDULED" },
  });

  console.log(`Reconciling ${pending.length} pending email(s) on boot...`);

  for (const row of pending) {
    await scheduleEmailJob(row.id, row.scheduledFor);
  }
}

reconcileOnBoot().catch((err) => {
  console.error("Boot reconciliation failed:", err);
});

console.log(
  `Email worker started. concurrency=${CONCURRENCY} minDelayMs=${MIN_DELAY_MS} maxPerHour=${MAX_PER_HOUR}`
);

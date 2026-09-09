import { Worker, Job } from "bullmq";
import * as dotenv from "dotenv";
dotenv.config();

import { redisConnection } from "./redis";
import { prisma } from "./db";
import { indexEmailJob } from "./elasticsearch";
import {
  EMAIL_QUEUE_NAME,
  scheduleEmailJob,
  emailQueue,
} from "./queue";
import {
  tryConsumeRateLimitSlot,
  nextHourBoundary,
} from "./rateLimiter";
import {
  sendMail,
  notifySlackRateLimitHit,
} from "./mailer";

const MAX_PER_HOUR =
  Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200;

const MIN_DELAY_MS =
  Number(process.env.MIN_DELAY_MS_BETWEEN_SENDS) || 2000;

const CONCURRENCY =
  Number(process.env.WORKER_CONCURRENCY) || 5;

async function processJob(job: Job<{ emailJobId: string }>) {
  const { emailJobId } = job.data;

  // IDEMPOTENCY GUARD #1:
  // Re-read the current state from PostgreSQL before doing anything.
  const row = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: {
      sender: {
        include: {
          user: {
            include: {
              slackConfig: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    console.warn(
      `EmailJob ${emailJobId} not found - dropping job.`
    );
    return;
  }

  if (row.status === "SENT") {
    console.log(
      `EmailJob ${emailJobId} already SENT - skipping (idempotent).`
    );
    return;
  }

  // RATE LIMIT CHECK
  // Redis-backed and safe across multiple worker instances.
  const { allowed, countThisHour } =
    await tryConsumeRateLimitSlot(
      row.senderId,
      MAX_PER_HOUR
    );

  if (!allowed) {
    // Do NOT drop or fail the job.
    // Move it to the next hour.
    const nextWindow = nextHourBoundary();

    const updated = await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "DELAYED_RATE_LIMIT",
        scheduledFor: nextWindow,
      },
    });

    // Keep Elasticsearch synchronized with PostgreSQL.
    await indexEmailJob(updated);

    await notifySlackRateLimitHit(
      row.sender.user?.slackConfig?.webhookUrl,
      row.sender.label,
      countThisHour,
      MAX_PER_HOUR
    );

    // Re-enqueue the same email for the next hour.
    await scheduleEmailJob(
      emailJobId,
      nextWindow
    );

    return;
  }

  // Minimum delay between email sends.
  await new Promise((res) =>
    setTimeout(res, MIN_DELAY_MS)
  );

  try {
    const { previewUrl } = await sendMail({
      smtpUser: row.sender.smtpUser,
      smtpPass: row.sender.smtpPass,
      to: row.recipient,
      subject: row.subject,
      html: row.body,
    });

    // Update PostgreSQL and keep the updated row.
    const updated = await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: {
          increment: 1,
        },
        errorMessage: previewUrl
          ? `Preview: ${previewUrl}`
          : null,
      },
    });

    // IMPORTANT:
    // PostgreSQL is now SENT, so update Elasticsearch too.
    await indexEmailJob(updated);
  } catch (err: any) {
    // Update PostgreSQL to FAILED.
    const updated = await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: "FAILED",
        attempts: {
          increment: 1,
        },
        errorMessage: String(
          err?.message || err
        ),
      },
    });

    // Keep Elasticsearch synchronized with the FAILED status too.
    await indexEmailJob(updated);

    // Let BullMQ retry/backoff handle the failure.
    throw err;
  }
}

export const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  processJob,
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
  }
);

emailWorker.on("completed", (job) => {
  console.log(
    `Job ${job.id} completed.`
  );
});

emailWorker.on("failed", (job, err) => {
  console.error(
    `Job ${job?.id} failed:`,
    err.message
  );
});

/**
 * RESTART RECOVERY.
 *
 * PostgreSQL remains the source of truth.
 *
 * On worker startup, find every EmailJob still marked
 * SCHEDULED and make sure it exists in BullMQ.
 *
 * Because scheduleEmailJob uses the EmailJob ID as
 * the BullMQ job ID, existing jobs are not duplicated.
 */
async function reconcileOnBoot() {
  const pending = await prisma.emailJob.findMany({
    where: {
      status: "SCHEDULED",
    },
  });

  console.log(
    `Reconciling ${pending.length} pending email(s) on boot...`
  );

  for (const row of pending) {
    await scheduleEmailJob(
      row.id,
      row.scheduledFor
    );
  }
}

reconcileOnBoot().catch((err) => {
  console.error(
    "Boot reconciliation failed:",
    err
  );
});

console.log(
  `Email worker started. concurrency=${CONCURRENCY} minDelayMs=${MIN_DELAY_MS} maxPerHour=${MAX_PER_HOUR}`
);
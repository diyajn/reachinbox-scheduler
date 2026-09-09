import { Router } from "express";
import { prisma } from "../db";
import { scheduleEmailJob } from "../queue";
import { indexEmailJob, searchEmails } from "../elasticsearch";

export const emailsRouter = Router();

/**
 * POST /api/emails/schedule
 * body: {
 *   senderId: string,
 *   recipients: string[],
 *   subject: string,
 *   body: string,
 *   startTime: string (ISO),
 *   delayBetweenEmailsMs?: number
 * }
 *
 * We create ONE EmailJob row per recipient, each with its own scheduledFor
 * time (startTime + i * delayBetweenEmailsMs), and enqueue each individually.
 */
emailsRouter.post("/schedule", async (req, res) => {
  try {
    const {
      senderId,
      recipients,
      subject,
      body,
      startTime,
      delayBetweenEmailsMs = 2000,
    } = req.body;

    if (!senderId || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "senderId and recipients[] are required" });
    }

    if (!subject || !body || !startTime) {
      return res
        .status(400)
        .json({ error: "subject, body, startTime are required" });
    }

    const baseTime = new Date(startTime);
    const created = [];

    for (let i = 0; i < recipients.length; i++) {
      const sendAt = new Date(
        baseTime.getTime() + i * delayBetweenEmailsMs
      );

      // 1. Create the email in PostgreSQL
      const row = await prisma.emailJob.create({
        data: {
          senderId,
          recipient: recipients[i],
          subject,
          body,
          scheduledFor: sendAt,
          status: "SCHEDULED",
        },
      });

      // 2. Create the BullMQ job
      const job = await scheduleEmailJob(row.id, sendAt);

      // 3. Save the BullMQ job ID in PostgreSQL
      const updated = await prisma.emailJob.update({
        where: { id: row.id },
        data: { bullJobId: job.id },
      });

      // 4. Index the complete email job in Elasticsearch
      await indexEmailJob(updated);

      created.push(updated.id);
    }

    res.status(201).json({
      scheduled: created.length,
      ids: created,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/emails/scheduled
 *
 * Returns emails that are either:
 * SCHEDULED
 * or
 * DELAYED_RATE_LIMIT
 */
emailsRouter.get("/scheduled", async (req, res) => {
  const rows = await prisma.emailJob.findMany({
    where: {
      status: {
        in: ["SCHEDULED", "DELAYED_RATE_LIMIT"],
      },
    },
    orderBy: {
      scheduledFor: "asc",
    },
  });

  res.json(rows);
});

/**
 * GET /api/emails/sent
 *
 * Returns completed emails:
 * SENT
 * or
 * FAILED
 */
emailsRouter.get("/sent", async (req, res) => {
  const rows = await prisma.emailJob.findMany({
    where: {
      status: {
        in: ["SENT", "FAILED"],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  res.json(rows);
});

/**
 * GET /api/emails/search?q=hello
 *
 * Search emails using Elasticsearch.
 *
 * Optional status filter:
 *
 * GET /api/emails/search?q=hello&status=SENT
 */
emailsRouter.get("/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    const status = req.query.status as string | undefined;

    const results = await searchEmails(q, status);

    res.json(results);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: err.message,
    });
  }
});
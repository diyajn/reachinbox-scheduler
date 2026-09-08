import { Router } from "express";
import { prisma } from "../db";
import { scheduleEmailJob } from "../queue";

export const emailsRouter = Router();

/**
 * POST /api/emails/schedule
 * body: {
 *   senderId: string,
 *   recipients: string[],      // parsed on the frontend from the uploaded CSV
 *   subject: string,
 *   body: string,
 *   startTime: string (ISO),   // when the FIRST email should go out
 *   delayBetweenEmailsMs?: number  // stagger between recipients in this batch
 * }
 *
 * We create ONE EmailJob row per recipient, each with its own scheduledFor
 * time (startTime + i * delayBetweenEmailsMs), and enqueue each individually.
 * This is what lets 1000+ emails scheduled "for the same time" actually
 * fan out over time instead of firing simultaneously.
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
      return res.status(400).json({ error: "senderId and recipients[] are required" });
    }
    if (!subject || !body || !startTime) {
      return res.status(400).json({ error: "subject, body, startTime are required" });
    }

    const baseTime = new Date(startTime);
    const created = [];

    for (let i = 0; i < recipients.length; i++) {
      const sendAt = new Date(baseTime.getTime() + i * delayBetweenEmailsMs);

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

      const job = await scheduleEmailJob(row.id, sendAt);
      await prisma.emailJob.update({
        where: { id: row.id },
        data: { bullJobId: job.id },
      });

      created.push(row.id);
    }

    res.status(201).json({ scheduled: created.length, ids: created });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

emailsRouter.get("/scheduled", async (req, res) => {
  const rows = await prisma.emailJob.findMany({
    where: { status: { in: ["SCHEDULED", "DELAYED_RATE_LIMIT"] } },
    orderBy: { scheduledFor: "asc" },
  });
  res.json(rows);
});

emailsRouter.get("/sent", async (req, res) => {
  const rows = await prisma.emailJob.findMany({
    where: { status: { in: ["SENT", "FAILED"] } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(rows);
});

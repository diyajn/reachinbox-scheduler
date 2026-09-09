import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
dotenv.config();

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { emailQueue } from "./queue";
import { emailsRouter } from "./routes/emails";
import { authRouter } from "./routes/auth";
import { slackAuthRouter } from "./routes/slackAuth";
import { ensureEmailIndex } from "./elasticsearch";
const app = express();
app.use(cors());
app.use(express.json());

// ---- Live BullMQ dashboard (required by the assignment) ----
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// ---- API routes ----
app.use("/api/emails", emailsRouter);
app.use("/auth", authRouter);
app.use("/auth", slackAuthRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

ensureEmailIndex().catch((err) =>
  console.error(
    "Failed to create Elasticsearch index (is it running?):",
    err.message
  )
);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`BullMQ dashboard: http://localhost:${PORT}/admin/queues`);
});

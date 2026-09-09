import { Router } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

type SlackOAuthResponse = {
  ok?: boolean;
  access_token?: string;
  incoming_webhook?: {
    url?: string;
    channel_id?: string;
    channel?: string;
  };
  error?: string;
};

export const slackAuthRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * Step 1: the frontend links "Connect Slack" here as
 *   `${API_BASE}/auth/slack?token=<the user's session JWT>`
 * We need to know WHICH user is connecting Slack, but Slack's OAuth dance
 * doesn't carry our own session for us - so we thread it through Slack's
 * `state` param (a standard OAuth mechanism for exactly this) and read it
 * back in the callback below.
 */
slackAuthRouter.get("/slack", (req, res) => {
  const sessionToken = req.query.token as string;
  if (!sessionToken) return res.status(401).send("Not logged in");

  let userId: string;
  try {
    const payload = jwt.verify(sessionToken, JWT_SECRET) as { userId: string };
    userId = payload.userId;
  } catch {
    return res.status(401).send("Invalid session");
  }

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    scope: "incoming-webhook",
    redirect_uri: process.env.SLACK_REDIRECT_URI || "",
    state: userId, // carried through, read back in the callback
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

/**
 * Step 2: Slack redirects back with `code` + our `state` (the userId).
 * We exchange the code for a token; for the incoming-webhook scope, Slack's
 * response includes an `incoming_webhook.url` - that URL is literally what
 * you POST a JSON message to, no further auth needed (see mailer.ts).
 */
slackAuthRouter.get("/slack/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;
    if (!code || !userId) return res.status(400).send("Missing code or state");

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID || "",
        client_secret: process.env.SLACK_CLIENT_SECRET || "",
        redirect_uri: process.env.SLACK_REDIRECT_URI || "",
      }),
    });
    const data = (await tokenRes.json()) as SlackOAuthResponse;

  if (!data.ok) {
    console.error("Slack OAuth failed:", data);
    return res.status(500).send("Slack connection failed");
  }

  if (!data.access_token) {
    console.error("Slack OAuth response missing access token:", data);
    return res.status(500).send("Slack access token missing");
  }

    await prisma.slackConfig.upsert({
      where: { userId },
      update: {
        accessToken: data.access_token,
        webhookUrl: data.incoming_webhook?.url,
        channelId: data.incoming_webhook?.channel_id,
      },
      create: {
        userId,
        accessToken: data.access_token,
        webhookUrl: data.incoming_webhook?.url,
        channelId: data.incoming_webhook?.channel_id,
      },
    });

    res.redirect(`${FRONTEND_URL}/?slack=connected`);
  } catch (err) {
    console.error("Slack callback error:", err);
    res.status(500).send("Slack connection failed");
  }
});

/** So the frontend can show "Connected" vs "Connect Slack" in the header. */
slackAuthRouter.get("/slack/status", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const config = await prisma.slackConfig.findUnique({
      where: { userId: payload.userId },
    });
    res.json({ connected: !!config });
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
});

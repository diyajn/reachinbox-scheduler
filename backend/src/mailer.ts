import nodemailer from "nodemailer";

/**
 * Builds a nodemailer transport for a given sender's Ethereal credentials.
 * Ethereal never actually delivers mail - it captures it and gives you a
 * "preview URL" you can open to see the rendered email. That preview URL is
 * exactly what you show in your demo video.
 */
export function buildTransport(smtpUser: string, smtpPass: string) {
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

export async function sendMail(opts: {
  smtpUser: string;
  smtpPass: string;
  to: string;
  subject: string;
  html: string;
}) {
  const transport = buildTransport(opts.smtpUser, opts.smtpPass);
  const info = await transport.sendMail({
    from: opts.smtpUser,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  // nodemailer.getTestMessageUrl gives you the Ethereal preview link
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  return { messageId: info.messageId, previewUrl };
}

/**
 * Fires a Slack message the moment a sender's hourly rate limit is hit.
 * If the user hasn't connected Slack (no webhookUrl), this is a silent no-op -
 * per the spec, that must never crash the worker.
 */
export async function notifySlackRateLimitHit(
  webhookUrl: string | null | undefined,
  senderLabel: string,
  countThisHour: number,
  limit: number
) {
  if (!webhookUrl) return; // not connected - do nothing, don't throw

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: Rate limit hit for sender *${senderLabel}* — ${countThisHour}/${limit} emails sent this hour. Remaining emails are being rescheduled to the next window.`,
      }),
    });
  } catch (err) {
    // Never let a Slack failure take down email processing.
    console.error("Slack notification failed:", err);
  }
}

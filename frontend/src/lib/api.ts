const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export type EmailJob = {
  id: string;
  recipient: string;
  subject: string;
  scheduledFor: string;
  sentAt: string | null;
  status: "SCHEDULED" | "SENT" | "FAILED" | "DELAYED_RATE_LIMIT";
};

export async function fetchScheduled(): Promise<EmailJob[]> {
  const res = await fetch(`${API_BASE}/api/emails/scheduled`, { cache: "no-store" });
  return res.json();
}

export async function fetchSent(): Promise<EmailJob[]> {
  const res = await fetch(`${API_BASE}/api/emails/sent`, { cache: "no-store" });
  return res.json();
}

export async function scheduleEmails(payload: {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmailsMs?: number;
}) {
  const res = await fetch(`${API_BASE}/api/emails/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to schedule");
  return res.json();
}

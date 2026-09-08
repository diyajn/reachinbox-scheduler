"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { scheduleEmails } from "@/lib/api";

// TODO: replace with the real sender id chosen from the logged-in user's
// senders once Google OAuth + multi-sender UI exist. For now this matches
// prisma/seed.ts on the backend.
const DEMO_SENDER_ID = "demo-sender-id";

export default function ComposePage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    Papa.parse(file, {
      complete: (result) => {
        const emails = (result.data as string[][])
          .flat()
          .map((v) => v.trim())
          .filter((v) => /\S+@\S+\.\S+/.test(v));
        setRecipients(emails);
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (recipients.length === 0) {
      setError("Upload a CSV/text file with at least one valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await scheduleEmails({
        senderId: DEMO_SENDER_ID,
        recipients,
        subject,
        body,
        startTime: new Date(startTime).toISOString(),
        delayBetweenEmailsMs: delayMs,
      });
      // NOTE: hourlyLimit is currently enforced via the backend's
      // MAX_EMAILS_PER_HOUR_PER_SENDER env var, not per-request — wire a
      // per-sender override in the schema if you need per-campaign limits.
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Compose New Email</h1>
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border bg-white p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Body</label>
          <textarea
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Upload leads (CSV/TXT)</label>
          <input type="file" accept=".csv,.txt" onChange={handleFile} className="text-sm" />
          {fileName && (
            <p className="mt-1 text-xs text-gray-500">
              {fileName} — {recipients.length} email address(es) detected
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Start time</label>
            <input
              required
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Delay (ms)</label>
            <input
              type="number"
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Hourly limit</label>
            <input
              type="number"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? "Scheduling…" : "Schedule"}
        </button>
      </form>
    </div>
  );
}

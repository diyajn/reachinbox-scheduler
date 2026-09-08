"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchScheduled, fetchSent, EmailJob } from "@/lib/api";
import EmailTable from "@/components/EmailTable";

export default function DashboardPage() {
  const [tab, setTab] = useState<"scheduled" | "sent">("scheduled");
  const [scheduled, setScheduled] = useState<EmailJob[]>([]);
  const [sent, setSent] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [s, se] = await Promise.all([fetchScheduled(), fetchSent()]);
    setScheduled(s);
    setSent(se);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // simple polling refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/compose"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Compose New Email
        </Link>
      </div>

      <div className="mb-4 flex gap-4 border-b">
        {(["scheduled", "sent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 pb-2 text-sm capitalize ${
              tab === t ? "border-gray-900 font-medium" : "border-transparent text-gray-500"
            }`}
          >
            {t} Emails
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4">
        {tab === "scheduled" ? (
          <EmailTable rows={scheduled} loading={loading} dateField="scheduledFor" />
        ) : (
          <EmailTable rows={sent} loading={loading} dateField="sentAt" />
        )}
      </div>
    </div>
  );
}

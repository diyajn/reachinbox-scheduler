import { EmailJob } from "@/lib/api";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  SENT: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  DELAYED_RATE_LIMIT: "bg-amber-100 text-amber-700",
};

export default function EmailTable({
  rows,
  loading,
  dateField,
}: {
  rows: EmailJob[];
  loading: boolean;
  dateField: "scheduledFor" | "sentAt";
}) {
  if (loading) {
    return <div className="py-10 text-center text-gray-400">Loading…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-gray-400">
        Nothing here yet.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-gray-500">
          <th className="py-2 pr-4">Email</th>
          <th className="py-2 pr-4">Subject</th>
          <th className="py-2 pr-4">{dateField === "sentAt" ? "Sent time" : "Scheduled time"}</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b last:border-0">
            <td className="py-2 pr-4">{row.recipient}</td>
            <td className="py-2 pr-4">{row.subject}</td>
            <td className="py-2 pr-4">
              {row[dateField] ? new Date(row[dateField] as string).toLocaleString() : "—"}
            </td>
            <td className="py-2 pr-4">
              <span className={`rounded-full px-2 py-1 text-xs ${statusColor[row.status]}`}>
                {row.status}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

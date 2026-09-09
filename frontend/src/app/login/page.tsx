import { googleLoginUrl } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-24 max-w-sm text-center">
      <h1 className="mb-2 text-xl font-semibold">ReachInbox Scheduler</h1>
      <p className="mb-6 text-sm text-gray-500">Sign in to manage your scheduled emails.</p>
      <a
        href={googleLoginUrl()}
        className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
      >
        Continue with Google
      </a>
    </div>
  );
}

import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ReachInbox Scheduler",
};

// TODO(real Google OAuth): replace this hardcoded user with a session read
// once /auth/google + /auth/google/callback exist on the backend.
const DEMO_USER = {
  name: "Demo User",
  email: "demo@reachinbox.local",
  avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=Demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <Link href="/" className="font-semibold">
            ReachInbox Scheduler
          </Link>
          <div className="flex items-center gap-3">
            <img src={DEMO_USER.avatarUrl} className="h-8 w-8 rounded-full" alt="" />
            <div className="text-sm">
              <div className="font-medium">{DEMO_USER.name}</div>
              <div className="text-gray-500">{DEMO_USER.email}</div>
            </div>
            <button className="ml-4 text-sm text-gray-500 hover:text-gray-800">
              Logout
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

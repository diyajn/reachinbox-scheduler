"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchMe, logout, Me } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetchMe().then((me) => {
      setUser(me);
      setChecked(true);
      if (!me && !PUBLIC_PATHS.includes(pathname)) {
        router.replace("/login");
      }
    });
  }, [pathname, router]);

  if (PUBLIC_PATHS.includes(pathname)) return null; // no header on login/callback screens
  if (!checked) return null; // avoid a flash of "logged out" header while checking

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3">
      <Link href="/" className="font-semibold">
        ReachInbox Scheduler
      </Link>
      {user && (
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} className="h-8 w-8 rounded-full" alt="" />
          )}
          <div className="text-sm">
            <div className="font-medium">{user.name}</div>
            <div className="text-gray-500">{user.email}</div>
          </div>
          <button
            onClick={logout}
            className="ml-4 text-sm text-gray-500 hover:text-gray-800"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}

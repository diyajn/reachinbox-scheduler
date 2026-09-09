"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveToken } from "@/lib/auth";

// useSearchParams() opts a page out of static prerendering unless it's
// wrapped in a Suspense boundary - Next.js requires this explicitly, which
// is why the build failed without it.
function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      saveToken(token);
      router.replace("/");
    } else {
      router.replace("/login");
    }
  }, [params, router]);

  return <div className="pt-24 text-center text-gray-400">Signing you in…</div>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="pt-24 text-center text-gray-400">Loading…</div>}>
      <CallbackHandler />
    </Suspense>
  );
}
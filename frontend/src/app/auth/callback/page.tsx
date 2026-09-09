"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveToken } from "@/lib/auth";

export default function AuthCallbackPage() {
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

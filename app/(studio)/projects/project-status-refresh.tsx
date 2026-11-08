"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const STATUS_REFRESH_INTERVAL_MS = 15_000;

export function ProjectStatusRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => router.refresh(), STATUS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, router]);

  return null;
}

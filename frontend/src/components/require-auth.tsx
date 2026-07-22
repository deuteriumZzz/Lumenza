"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-1 items-center justify-center text-sm text-muted"
      >
        Загрузка…
      </div>
    );
  }

  return <>{children}</>;
}

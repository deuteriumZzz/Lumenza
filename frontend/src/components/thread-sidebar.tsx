"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { api, apiErrorMessage, type ChatThread, type Paginated } from "@/lib/api";

export function ThreadSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [result, setResult] = useState<Paginated<ChatThread> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeThreadId = pathname.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;

  // Рефетч при каждой смене pathname внутри /chat — самый простой способ
  // подхватить только что созданный тред (ChatThreadView создаёт его и сам
  // роутится на /chat/<id>, отдельного паб/саб-механизма в проекте нет, а
  // заводить его ради одного списка — overkill). Список маленький и
  // пагинированный, лишний повторный запрос дёшев.
  useEffect(() => {
    let cancelled = false;
    api.threads().then(
      (data) => {
        if (!cancelled) setResult(data);
      },
      (err) => {
        if (!cancelled) setError(apiErrorMessage(err, "Не удалось загрузить чаты."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function handleDelete(id: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await api.deleteThread(id);
      setResult((prev) => (prev ? { ...prev, results: prev.results.filter((t) => t.id !== id) } : prev));
      if (activeThreadId === String(id)) router.push("/chat");
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить чат."));
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface/50 px-3 py-4">
      <Link
        href="/chat"
        className="btn-secondary mb-3 flex items-center justify-center gap-1.5 text-sm"
      >
        <span aria-hidden="true">+</span> Новый чат
      </Link>

      {error && (
        <p role="alert" className="mb-2 px-2 text-xs text-danger">
          {error}
        </p>
      )}

      <nav aria-label="Чаты" className="flex-1 overflow-y-auto">
        {result === null ? null : result.results.length === 0 ? (
          <p className="px-2 text-xs text-muted">Пока нет ни одного чата.</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {result.results.map((thread) => {
              const active = activeThreadId === String(thread.id);
              return (
                <motion.li
                  key={thread.id}
                  initial={{ opacity: 0, y: motionTokens.distance.sm }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springs.gentle}
                >
                  <Link
                    href={`/chat/${thread.id}`}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ${
                      active ? "bg-surface-raised text-ink" : "text-muted hover:bg-surface hover:text-ink"
                    }`}
                  >
                    <span className="truncate">{thread.title || "Новый чат"}</span>
                    <button
                      type="button"
                      onClick={(event) => void handleDelete(thread.id, event)}
                      aria-label="Удалить чат"
                      title="Удалить чат"
                      className="shrink-0 rounded p-0.5 text-muted opacity-0 transition-opacity duration-150 hover:text-danger group-hover:opacity-100"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                        <path d="M6 6l12 12" strokeLinecap="round" />
                        <path d="M18 6L6 18" strokeLinecap="round" />
                      </svg>
                    </button>
                  </Link>
                </motion.li>
              );
            })}
          </ol>
        )}
      </nav>
    </aside>
  );
}

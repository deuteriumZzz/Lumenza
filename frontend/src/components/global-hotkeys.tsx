"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Ctrl/Cmd+Shift+L — живой голосовой режим доступен из любого места
// приложения, не только когда пользователь уже открыл вкладку "Голос" в
// Студии. Диктовка (Ctrl/Cmd+Shift+M) — отдельный хоткей внутри
// ChatThreadView, привязана к композеру чата и там же уместнее.
export function GlobalHotkeys() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        router.push("/studio?mode=voice&autostart=1");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}

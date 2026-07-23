"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens } from "@/lib/motion";

// Next.js App Router переключает /chat <-> /studio (и любой другой роут)
// жёстко, без перехода — оборачиваем содержимое в AnimatePresence, ключ —
// pathname, лёгкий crossfade + сдвиг. Ease, не spring (DESIGN.md: Desk-зона
// — restrained, никакого bounce/overshoot), применяется на уровне корневого
// layout ко всем переходам единообразно, а не только к паре Чат/Студия —
// точечно отслеживать именно эту пару потребовало бы отдельного стейта
// ради сомнительной выгоды.
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: motionTokens.distance.xs }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -motionTokens.distance.xs }}
        transition={{ duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth }}
        className="flex flex-1 flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

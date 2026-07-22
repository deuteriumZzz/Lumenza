"use client";

import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion";

export function ResponseSkeleton() {
  // Уважаемое движение — reduced motion получает только лёгкую пульсацию
  // прозрачности вместо подпрыгивания (см. ecc:motion-foundations, правило
  // "reduced motion переопределяет всё").
  const reduce = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className="mt-6 max-w-xl">
      <span className="sr-only">Генерируем ответ…</span>
      <div aria-hidden="true" className="flex items-center gap-1.5 py-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full bg-muted"
            animate={
              reduce
                ? { opacity: [0.4, 1, 0.4] }
                : { y: [0, -motionTokens.distance.xs, 0] }
            }
            transition={{
              duration: reduce ? motionTokens.duration.slow : motionTokens.duration.crawl,
              repeat: Infinity,
              ease: motionTokens.easing.smooth,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
    </div>
  );
}

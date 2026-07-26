"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion";

function routeFamily(pathname: string) {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/studio")) return "studio";
  return "page";
}

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const family = routeFamily(pathname);
  const veilDirection = family === "chat" ? 1 : -1;

  return (
    <div className="route-transition-stage overflow-x-clip">
      <motion.div
        key={pathname}
        data-route-transition={pathname}
        data-route-family={family}
        data-reduced-motion={String(Boolean(shouldReduceMotion))}
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
                y: motionTokens.distance.sm,
                scale: motionTokens.scale.route,
              }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                duration: motionTokens.duration.normal,
                ease: motionTokens.easing.smooth,
                opacity: { duration: motionTokens.duration.fast },
              }
        }
        className="route-transition-frame"
      >
        {!shouldReduceMotion && (
          <motion.span
            aria-hidden="true"
            data-testid="route-transition-veil"
            className="route-transition-veil"
            initial={{ opacity: 0, x: `${veilDirection * 34}%` }}
            animate={{
              opacity: [0, 0.72, 0],
              x: [
                `${veilDirection * 34}%`,
                `${veilDirection * -8}%`,
                `${veilDirection * -48}%`,
              ],
            }}
            transition={{
              duration: motionTokens.duration.slow,
              ease: motionTokens.easing.smooth,
              times: [0, 0.38, 1],
            }}
          />
        )}
        {children}
      </motion.div>
    </div>
  );
}

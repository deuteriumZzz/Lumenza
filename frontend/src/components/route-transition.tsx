"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens } from "@/lib/motion";
import { getWorkspaceSection } from "@/lib/workspace-sections";

function routeFamily(pathname: string) {
  return getWorkspaceSection(pathname)?.key ?? "page";
}

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const family = routeFamily(pathname);
  const [routeState, setRouteState] = useState(() => ({
    pathname,
    current: family,
    previous: family,
  }));
  if (routeState.pathname !== pathname) {
    setRouteState({ pathname, current: family, previous: routeState.current });
  }
  const previousFamily = routeState.previous;
  const workspaceMorph =
    previousFamily === "chat" && family === "agents"
      ? "chat-to-agents"
      : previousFamily === "agents" && family === "chat"
        ? "agents-to-chat"
        : "standard";
  const veilDirection = family === "chat" ? 1 : -1;

  return (
    <div className="route-transition-stage overflow-x-clip">
      <motion.div
        key={pathname}
        data-route-transition={pathname}
        data-route-family={family}
        data-transition={workspaceMorph}
        data-reduced-motion={String(Boolean(shouldReduceMotion))}
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
                y: workspaceMorph === "chat-to-agents" ? motionTokens.distance.lg : motionTokens.distance.sm,
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

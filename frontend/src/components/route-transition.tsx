"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { redesignMotion } from "@/lib/motion";
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
  return (
    <div
      className="route-transition-stage overflow-x-clip"
      data-testid="route-transition-stage"
      data-shared-layout-group="lumenza-command-deck"
    >
      <AnimatePresence>
        {!shouldReduceMotion && workspaceMorph !== "standard" && (
          <WorkspaceModeMorph
            key={`${previousFamily}-${family}`}
            from={previousFamily as "chat" | "agents"}
            to={family as "chat" | "agents"}
          />
        )}
      </AnimatePresence>
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
                opacity: workspaceMorph === "standard" ? 0 : 0.42,
                transform: "translate3d(0, 4px, 0)",
              }
        }
        animate={{ opacity: 1, transform: "translate3d(0, 0, 0)" }}
        transition={shouldReduceMotion ? { duration: 0 } : redesignMotion.routeIn}
        className="route-transition-frame"
      >
        {children}
      </motion.div>
    </div>
  );
}

const MODE_NODES = {
  chat: [{ x: 8, y: 10 }, { x: 8, y: 24 }, { x: 8, y: 38 }],
  agents: [{ x: 11, y: 11 }, { x: 37, y: 11 }, { x: 24, y: 37 }],
} as const;

function WorkspaceModeMorph({ from, to }: { from: "chat" | "agents"; to: "chat" | "agents" }) {
  return (
    <motion.div
      data-testid="workspace-mode-morph"
      data-from={from}
      data-to={to}
      className="workspace-mode-morph"
      initial={{ opacity: 0, transform: "translate3d(0, 46px, 0) scale(.82)" }}
      animate={{
        opacity: [0, 1, 1, 0],
        transform: [
          "translate3d(0, 46px, 0) scale(.82)",
          "translate3d(0, 0, 0) scale(1)",
          "translate3d(0, -4px, 0) scale(1.04)",
          "translate3d(0, -14px, 0) scale(1.12)",
        ],
      }}
      exit={{ opacity: 0, transform: "translate3d(0, -14px, 0) scale(1.12)" }}
      transition={{ ...redesignMotion.lumenzaCoreTransition, times: [0, 0.2, 0.72, 1] }}
      aria-hidden="true"
    >
      <motion.svg viewBox="0 0 48 48" className="size-24 sm:size-28">
        {MODE_NODES[from].map((node, index) => {
          const target = MODE_NODES[to][index];
          const targetR = to === "agents" ? 2.65 : 2.1;
          return (
            <motion.circle
              key={index}
              data-morph-node=""
              cx={node.x}
              cy={node.y}
              r={2.1}
              initial={{ x: 0, y: 0, scale: 1 }}
              animate={{ x: target.x - node.x, y: target.y - node.y, scale: targetR / 2.1 }}
              transition={redesignMotion.lumenzaCoreTransition}
              className="workspace-mode-node"
            />
          );
        })}
        <motion.path
          initial={{ rotate: from === "agents" ? 45 : 0, scale: from === "agents" ? 0.9 : 1 }}
          animate={{ rotate: to === "agents" ? 45 : 0, scale: to === "agents" ? 0.9 : 1 }}
          transition={redesignMotion.lumenzaCoreTransition}
          style={{ transformOrigin: "24px 24px" }}
          d="M24 15.5 32 20v8l-8 4.5-8-4.5v-8Z"
          className="workspace-mode-core"
        />
        <motion.path
          initial={{ pathLength: 0.2, opacity: 0.35 }}
          animate={{ pathLength: 1, opacity: [0.35, 0.9, 0.2] }}
          transition={redesignMotion.lumenzaCoreTransition}
          d={to === "agents" ? "M11 11 24 24 37 11M24 24v13" : "M8 10 24 24M8 24h16M8 38 24 24M24 24h17"}
          className="workspace-mode-path"
        />
      </motion.svg>
    </motion.div>
  );
}

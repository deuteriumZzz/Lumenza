"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { springs } from "@/lib/motion";
import styles from "@/components/lumenza-workspace-core.module.css";

const CHAT_LABEL = "Lumenza объединяет несколько AI-моделей в один ответ";

type LumenzaWorkspaceCoreProps = {
  children?: ReactNode;
  className?: string;
  mode: "chat" | "agents";
  testId?: string;
};

export function LumenzaWorkspaceCore({
  children,
  className,
  mode,
  testId = "lumenza-core",
}: LumenzaWorkspaceCoreProps) {
  const shouldReduceMotion = useReducedMotion();
  const isChat = mode === "chat";

  return (
    <motion.div
      layoutId="lumenza-workspace-core"
      transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
      className={`${styles.core} ${isChat ? styles.chatCore : styles.agentCore}${className ? ` ${className}` : ""}`}
      data-testid={testId}
      data-core-mode={mode}
      data-motion-key="lumenza-core"
      data-motion-scene={isChat ? "chat-astrolabe" : "agent-network"}
      role={isChat ? "img" : undefined}
      aria-label={isChat ? CHAT_LABEL : undefined}
      aria-hidden={isChat ? undefined : true}
    >
      <motion.span
        aria-hidden="true"
        className={styles.coreAura}
        animate={{ opacity: isChat ? 0.62 : 0.82, scale: isChat ? 1 : 1.18 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.7 }}
      />

      {isChat ? <ChatAstrolabe /> : <AgentNetwork />}

      <motion.span
        aria-hidden="true"
        layoutId="lumenza-core-disc"
        className={styles.coreDisc}
        transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
      >
        <span className={styles.corePulse}>
          <AnimatePresence mode="wait" initial={false}>
            {isChat ? <ChatSymbol key="chat" reduced={Boolean(shouldReduceMotion)} /> : <AgentSymbol key="agents" reduced={Boolean(shouldReduceMotion)} />}
          </AnimatePresence>
        </span>
      </motion.span>

      {children}

      {isChat ? (
        <span className={styles.caption} aria-hidden="true">
          Модели сходятся здесь
        </span>
      ) : null}
    </motion.div>
  );
}

function ChatAstrolabe() {
  return (
    <svg className={styles.coreSystem} viewBox="0 0 300 300" aria-hidden="true">
      <defs>
        <filter id="lumenza-chat-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="lumenza-chat-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efad47" />
          <stop offset=".48" stopColor="#63d9df" />
          <stop offset="1" stopColor="#efad47" stopOpacity=".22" />
        </linearGradient>
      </defs>
      <g className={styles.coreAxis} data-core-axis>
        <path d="M150 17V283M17 150H283" />
        <path d="M56 56 244 244M244 56 56 244" />
      </g>
      <g className={`${styles.orbitTrack} ${styles.orbitTrackOne}`} data-orbit-track>
        <circle cx="150" cy="150" r="112" />
        <circle cx="150" cy="38" r="3.2" data-orbit-particle />
        <circle cx="248" cy="204" r="2.4" data-orbit-particle />
      </g>
      <g className={`${styles.orbitTrack} ${styles.orbitTrackTwo}`} data-orbit-track>
        <circle cx="150" cy="150" r="91" />
        <circle cx="78" cy="94" r="3" data-orbit-particle />
        <circle cx="213" cy="216" r="2.3" data-orbit-particle />
      </g>
      <g className={`${styles.orbitTrack} ${styles.orbitTrackThree}`} data-orbit-track>
        <circle cx="150" cy="150" r="70" />
        <circle cx="211" cy="115" r="2.7" data-orbit-particle />
      </g>
      <g className={`${styles.orbitTrack} ${styles.orbitTrackFour}`} data-orbit-track>
        <ellipse cx="150" cy="150" rx="119" ry="51" transform="rotate(48 150 150)" />
        <circle cx="112" cy="60" r="2.6" data-orbit-particle />
        <circle cx="190" cy="241" r="2" data-orbit-particle />
      </g>
    </svg>
  );
}

function AgentNetwork() {
  return (
    <svg className={styles.coreSystem} viewBox="0 0 720 260" aria-hidden="true">
      <defs>
        <filter id="lumenza-agent-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="lumenza-agent-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#63d9df" stopOpacity=".15" />
          <stop offset=".5" stopColor="#efad47" />
          <stop offset="1" stopColor="#63d9df" stopOpacity=".18" />
        </linearGradient>
      </defs>
      <path className={styles.networkSpokes} d="M360 130 86 77M360 130 632 70M360 130 92 197M360 130 628 196M360 130 360 24" />
      <g className={`${styles.networkLane} ${styles.networkLaneOne}`} data-network-lane><ellipse cx="360" cy="130" rx="316" ry="91" /><circle cx="75" cy="91" r="3" data-signal-pulse /><circle cx="632" cy="179" r="2.6" data-signal-pulse /></g>
      <g className={`${styles.networkLane} ${styles.networkLaneTwo}`} data-network-lane><ellipse cx="360" cy="130" rx="278" ry="69" /><circle cx="118" cy="95" r="2.4" data-signal-pulse /></g>
      <g className={`${styles.networkLane} ${styles.networkLaneThree}`} data-network-lane><ellipse cx="360" cy="130" rx="221" ry="49" /><circle cx="550" cy="154" r="2.8" data-signal-pulse /></g>
      <g className={`${styles.networkLane} ${styles.networkLaneFour}`} data-network-lane><ellipse cx="360" cy="130" rx="160" ry="30" /><circle cx="225" cy="144" r="2.2" data-signal-pulse /><circle cx="448" cy="105" r="2" data-signal-pulse /></g>
    </svg>
  );
}

function ChatSymbol({ reduced }: { reduced: boolean }) {
  return (
    <motion.svg
      className={styles.spark}
      viewBox="0 0 80 80"
      initial={reduced ? false : { opacity: 0, rotate: -42, scale: 0.55 }}
      animate={{ opacity: 1, rotate: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, rotate: 36, scale: 0.62 }}
      transition={{ duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden="true"
    >
      <path fill="currentColor" d="M40 4 44.8 31.2 60 20 48.8 35.2 76 40l-27.2 4.8L60 60 44.8 48.8 40 76l-4.8-27.2L20 60l11.2-15.2L4 40l27.2-4.8L20 20l15.2 11.2L40 4Z" />
    </motion.svg>
  );
}

function AgentSymbol({ reduced }: { reduced: boolean }) {
  return (
    <motion.svg
      className={styles.spark}
      viewBox="0 0 80 80"
      initial={reduced ? false : { opacity: 0, rotate: 38, scale: 0.56 }}
      animate={{ opacity: 1, rotate: 0, scale: 1 }}
      exit={reduced ? undefined : { opacity: 0, rotate: -32, scale: 0.62 }}
      transition={{ duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <rect x="17" y="34" width="5" height="12" rx="2.5" /><rect x="28" y="24" width="5" height="32" rx="2.5" />
        <rect x="39" y="15" width="5" height="50" rx="2.5" /><rect x="50" y="24" width="5" height="32" rx="2.5" />
        <rect x="61" y="34" width="5" height="12" rx="2.5" /><circle cx="9" cy="40" r="4" />
        <circle cx="73" cy="40" r="4" /><circle cx="41.5" cy="7" r="3" /><circle cx="41.5" cy="73" r="3" />
      </g>
    </motion.svg>
  );
}

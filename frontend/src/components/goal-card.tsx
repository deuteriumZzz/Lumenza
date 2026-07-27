"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens, springs } from "@/lib/motion";

interface GoalCardProps {
  href: string;
  title: string;
  description: string;
  caption?: string;
  index?: number;
}

// Shared between /home's goal-card grid and the /agents catalog — a card of
// exactly one agent should look intentional, not like a broken grid, so
// both places use the same visual language.
export function GoalCard({ href, title, description, caption, index = 0 }: GoalCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: motionTokens.distance.sm }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.gentle, delay: shouldReduceMotion ? 0 : index * 0.05 }}
    >
      <Link
        href={href}
        className="flex h-full flex-col rounded-md border border-border bg-surface p-4 transition-colors duration-150 hover:bg-surface-raised"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {caption && <span className="shrink-0 text-[11px] text-muted">{caption}</span>}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </Link>
    </motion.div>
  );
}

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { motionTokens, springs } from "@/lib/motion";

interface GoalCardProps {
  href: string;
  title: string;
  description: string;
  caption?: string;
  icon?: React.ReactNode;
  index?: number;
}

// Shared between /home's goal-card grid and the /agents catalog — a card of
// exactly one agent should look intentional, not like a broken grid, so
// both places use the same visual language. `icon` is optional so /home's
// plain cards keep their current look; the agents catalog passes a
// category glyph to match the reference's colour-badged scenario cards.
const ICON_TONES = [
  "border-primary/30 bg-primary/8 text-primary",
  "border-accent/35 bg-accent/8 text-accent",
  "border-success/35 bg-success/8 text-success",
];

export function GoalCard({ href, title, description, caption, icon, index = 0 }: GoalCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const tone = ICON_TONES[index % ICON_TONES.length];

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
          <span className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span aria-hidden="true" className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full border ${tone}`}>
                {icon}
              </span>
            )}
            <h2 className="truncate text-sm font-medium text-ink">{title}</h2>
          </span>
          {caption && <span className="shrink-0 text-[11px] text-muted">{caption}</span>}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </Link>
    </motion.div>
  );
}

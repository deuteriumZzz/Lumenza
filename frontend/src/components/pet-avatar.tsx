"use client";

/* Uploaded pet photos are rendered from the validated media endpoint. */
/* eslint-disable @next/next/no-img-element */

import { motion, useReducedMotion } from "motion/react";
import type { PetPreset, User } from "@/lib/api";

const PRESET_LABELS: Record<PetPreset, string> = {
  fox: "Лис",
  cat: "Кот",
  robot: "Робот",
  dragon: "Дракон",
  rabbit: "Кролик",
  blob: "Капля",
};

export function petPresetLabel(preset: PetPreset): string {
  return PRESET_LABELS[preset];
}

interface PetAvatarProps {
  user: Pick<User, "pet_image" | "pet_preset" | "pet_name" | "username">;
  active?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** false when an adjacent text label already announces the name (e.g.
   * the account popover header) — keeps the avatar itself decorative. */
  labelled?: boolean;
}

// Shared renderer for the companion so the sidebar avatar, the account
// popover, and the profile preview all stay in sync: an uploaded photo
// wins over a preset, a preset wins over the plain placeholder glyph.
export function PetAvatar({ user, active = false, size = "md", className = "", labelled = true }: PetAvatarProps) {
  const shouldReduceMotion = useReducedMotion();
  const alt = labelled ? user.pet_name || "Питомец" : "";

  if (user.pet_image) {
    return (
      <span className={`pet-avatar pet-avatar-${size} ${className}`} data-active={active}>
        <img src={user.pet_image} alt={alt} className="size-full object-cover" />
      </span>
    );
  }

  if (user.pet_preset) {
    return (
      <motion.span
        className={`pet-avatar pet-avatar-${size} pet-avatar-preset pet-avatar-${user.pet_preset} ${className}`}
        data-active={active}
        aria-label={alt || undefined}
        aria-hidden={labelled ? undefined : true}
        role={labelled ? "img" : undefined}
        animate={
          shouldReduceMotion
            ? undefined
            : active
              ? { y: [0, -3, 0, -1, 0], rotate: [0, -4, 3, -2, 0], scale: [1, 1.05, 1.02, 1.04, 1] }
              : { y: [0, -1.5, 0] }
        }
        transition={{
          duration: active ? 0.9 : 2.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <PetPresetGlyph preset={user.pet_preset} />
        {active && <span aria-hidden="true" className="pet-avatar-activity-ring" />}
      </motion.span>
    );
  }

  return (
    <span className={`pet-avatar pet-avatar-${size} pet-avatar-empty ${className}`} aria-hidden="true">
      ✦
    </span>
  );
}

function PetPresetGlyph({ preset }: { preset: PetPreset }) {
  const common = { viewBox: "0 0 32 32", className: "size-full", "aria-hidden": true } as const;
  switch (preset) {
    case "fox":
      return (
        <svg {...common}>
          <path d="M8 6 3 13l7 2Z" className="pet-glyph-fill" />
          <path d="M24 6l5 7-7 2Z" className="pet-glyph-fill" />
          <ellipse cx="16" cy="19" rx="10" ry="8" className="pet-glyph-fill" />
          <path d="M16 22 12 26h8Z" className="pet-glyph-accent" />
          <circle cx="12" cy="17" r="1.4" className="pet-glyph-eye" />
          <circle cx="20" cy="17" r="1.4" className="pet-glyph-eye" />
        </svg>
      );
    case "cat":
      return (
        <svg {...common}>
          <path d="M9 6 6 14l6 1Z" className="pet-glyph-fill" />
          <path d="M23 6l3 8-6 1Z" className="pet-glyph-fill" />
          <circle cx="16" cy="19" r="9" className="pet-glyph-fill" />
          <circle cx="12.5" cy="18" r="1.4" className="pet-glyph-eye" />
          <circle cx="19.5" cy="18" r="1.4" className="pet-glyph-eye" />
          <path d="M14 22q2 1.6 4 0" className="pet-glyph-mouth" fill="none" strokeWidth="1.4" stroke="currentColor" strokeLinecap="round" />
        </svg>
      );
    case "robot":
      return (
        <svg {...common}>
          <rect x="8" y="10" width="16" height="14" rx="4" className="pet-glyph-fill" />
          <rect x="14" y="4" width="4" height="5" rx="2" className="pet-glyph-accent" />
          <circle cx="16" cy="4" r="1.6" className="pet-glyph-accent" />
          <circle cx="12.5" cy="17" r="1.6" className="pet-glyph-eye" />
          <circle cx="19.5" cy="17" r="1.6" className="pet-glyph-eye" />
          <rect x="12" y="21" width="8" height="1.6" rx="0.8" className="pet-glyph-mouth-fill" />
        </svg>
      );
    case "dragon":
      return (
        <svg {...common}>
          <path d="M9 8 5 5l1 6Z" className="pet-glyph-accent" />
          <path d="M23 8l4-3-1 6Z" className="pet-glyph-accent" />
          <ellipse cx="16" cy="19" rx="10" ry="8" className="pet-glyph-fill" />
          <path d="M8 20q-3 1-4 4" fill="none" strokeWidth="2" stroke="currentColor" strokeLinecap="round" className="pet-glyph-accent-line" />
          <circle cx="12.5" cy="17" r="1.4" className="pet-glyph-eye" />
          <circle cx="19.5" cy="17" r="1.4" className="pet-glyph-eye" />
        </svg>
      );
    case "rabbit":
      return (
        <svg {...common}>
          <ellipse cx="11.5" cy="8" rx="2.6" ry="7" className="pet-glyph-fill" />
          <ellipse cx="20.5" cy="8" rx="2.6" ry="7" className="pet-glyph-fill" />
          <circle cx="16" cy="19" r="9" className="pet-glyph-fill" />
          <circle cx="12.5" cy="18" r="1.4" className="pet-glyph-eye" />
          <circle cx="19.5" cy="18" r="1.4" className="pet-glyph-eye" />
          <circle cx="16" cy="21" r="1.1" className="pet-glyph-accent" />
        </svg>
      );
    case "blob":
    default:
      return (
        <svg {...common}>
          <path
            d="M16 4c7 0 11 5.5 11 12s-5 12-11 12S5 22.5 5 16 9 4 16 4Z"
            className="pet-glyph-fill"
          />
          <circle cx="12.5" cy="15" r="1.5" className="pet-glyph-eye" />
          <circle cx="19.5" cy="15" r="1.5" className="pet-glyph-eye" />
          <path d="M13 20q3 2 6 0" fill="none" strokeWidth="1.4" stroke="currentColor" strokeLinecap="round" className="pet-glyph-mouth" />
        </svg>
      );
  }
}

"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";

// Lets any part of the app (agent run pages, automations, studio jobs)
// tell the companion avatar "a scenario is running right now" without
// wiring props through the sidebar — the pet is rendered far from where
// scenarios execute (AccountMenu lives in ThreadSidebar), so a small
// shared signal is simpler than prop-drilling. Multiple concurrent
// callers are supported via a reference count rather than a plain
// boolean, so one finished run can't turn off another run's animation.
interface PetActivityContextValue {
  active: boolean;
  setActive: (next: boolean) => void;
}

const PetActivityContext = createContext<PetActivityContextValue>({
  active: false,
  setActive: () => undefined,
});

export function PetActivityProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = useState(false);
  const countRef = useRef(0);

  const value = useMemo<PetActivityContextValue>(() => ({
    active,
    setActive: (next) => {
      countRef.current = Math.max(0, countRef.current + (next ? 1 : -1));
      setActiveState(countRef.current > 0);
    },
  }), [active]);

  return <PetActivityContext.Provider value={value}>{children}</PetActivityContext.Provider>;
}

export function usePetActivity() {
  return useContext(PetActivityContext).active;
}

export function usePetActivityControls() {
  return useContext(PetActivityContext).setActive;
}

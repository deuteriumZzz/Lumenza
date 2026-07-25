"use client";

import { useEffect, useRef } from "react";

const POINTER_SELECTOR = [
  "a",
  "button:not(:disabled)",
  "select:not(:disabled)",
  "summary",
  "[role='button']",
  "[role='option']:not([aria-disabled='true'])",
  "[data-cursor='interactive']",
  "input:not(:disabled):is([type='button'], [type='checkbox'], [type='color'], [type='file'], [type='image'], [type='radio'], [type='range'], [type='reset'], [type='submit'])",
].join(",");

const TEXT_SELECTOR = [
  "input:not(:disabled):not([type])",
  "input:not(:disabled):is([type='date'], [type='datetime-local'], [type='email'], [type='month'], [type='number'], [type='password'], [type='search'], [type='tel'], [type='text'], [type='time'], [type='url'], [type='week'])",
  "textarea:not(:disabled)",
  "[contenteditable='true']",
].join(",");

const DISABLED_SELECTOR = [
  "button:disabled",
  "input:disabled",
  "select:disabled",
  "[aria-disabled='true']",
].join(",");

const ARROW_PATH =
  "M4.2 2.6C2.5 1.9 1 3.4 1.6 5.1l8.2 27.4c.55 1.84 3.05 2.13 4.02.47l5.65-9.65 9.71-2.72c1.91-.54 2.1-3.18.31-4.01L4.2 2.6Z";

type CursorMode = "default" | "pointer" | "text" | "disabled";

function resolveMode(target: EventTarget | null): CursorMode {
  const element = target instanceof Element ? target : null;
  if (!element) return "default";
  if (element.closest(DISABLED_SELECTOR)) return "disabled";
  if (element.closest(POINTER_SELECTOR)) return "pointer";
  if (element.closest(TEXT_SELECTOR)) return "text";
  return "default";
}

// Один и тот же курсор (свечающая стрелка Lumenza) остаётся на экране над
// абсолютно любым элементом — кнопкой, ссылкой, полем ввода — вместо того,
// чтобы уступать место нативному курсору ОС (раньше именно так и было:
// над кнопками появлялась обычная "рука", над текстовыми полями —
// системный I-beam, и интерфейс терял целостность). Разные режимы
// (data-mode) меняют не саму иконографию, а её акцент — масштаб, ореол,
// штрих — чтобы стрелка везде читалась как один и тот же курсор в разных
// состояниях.
export function BrandCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    const precisePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    const setVisible = (visible: boolean) => {
      const nextVisibility = String(visible);
      if (cursor.dataset.visible !== nextVisibility) {
        cursor.dataset.visible = nextVisibility;
      }
    };
    const setMode = (target: EventTarget | null) => {
      cursor.dataset.mode = resolveMode(target);
    };
    const setEnabled = (enabled: boolean) => {
      if (enabled) {
        document.documentElement.dataset.customCursor = "true";
        return;
      }
      delete document.documentElement.dataset.customCursor;
      setVisible(false);
      cursor.dataset.pressed = "false";
    };
    const updatePreference = () => {
      setEnabled(precisePointer.matches && !reducedMotion.matches);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        setVisible(false);
        cursor.dataset.pressed = "false";
        return;
      }
      if (
        document.documentElement.dataset.customCursor !== "true" &&
        event.pointerType === "mouse" &&
        !reducedMotion.matches
      ) {
        setEnabled(true);
      }
      if (document.documentElement.dataset.customCursor !== "true") return;

      positionRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => {
          cursor.style.setProperty("--cursor-x", `${positionRef.current.x}px`);
          cursor.style.setProperty("--cursor-y", `${positionRef.current.y}px`);
          frameRef.current = null;
        });
      }
      setVisible(true);
    };
    const onPointerOver = (event: PointerEvent) => {
      if (document.documentElement.dataset.customCursor !== "true") return;
      setMode(event.target);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) setVisible(false);
    };
    const setPressed = (pressed: boolean) => {
      cursor.dataset.pressed = String(pressed);
    };
    const triggerBurst = () => {
      const burst = burstRef.current;
      if (!burst) return;
      burst.classList.remove("is-active");
      // Форсируем reflow, иначе повторное добавление класса подряд не
      // перезапускает CSS-анимацию (браузер видит "тот же" стиль).
      void burst.offsetWidth;
      burst.classList.add("is-active");
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        setVisible(false);
        setPressed(false);
        return;
      }
      if (document.documentElement.dataset.customCursor === "true") {
        setPressed(true);
        triggerBurst();
      }
    };
    const onPointerUp = () => setPressed(false);
    const onWindowBlur = () => {
      setVisible(false);
      setPressed(false);
    };

    updatePreference();
    precisePointer.addEventListener?.("change", updatePreference);
    reducedMotion.addEventListener?.("change", updatePreference);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("blur", onWindowBlur);

    return () => {
      delete document.documentElement.dataset.customCursor;
      precisePointer.removeEventListener?.("change", updatePreference);
      reducedMotion.removeEventListener?.("change", updatePreference);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      data-testid="brand-cursor"
      data-visible="false"
      data-mode="default"
      data-pressed="false"
      className="brand-cursor"
      aria-hidden="true"
    >
      <span className="brand-cursor-track">
        <span className="brand-cursor-glyph">
          <span
            ref={burstRef}
            data-testid="brand-cursor-burst"
            className="brand-cursor-burst"
          />
          <svg
            viewBox="0 0 32 36"
            className="brand-cursor-arrow"
            fill="none"
            style={{ color: "var(--color-primary)" }}
          >
            <path
              className="brand-cursor-arrow-glow"
              d={ARROW_PATH}
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
            />
            <path
              className="brand-cursor-arrow-shape"
              d={ARROW_PATH}
              fill="var(--cursor-arrow-fill)"
              stroke="var(--cursor-arrow-outline)"
              strokeLinejoin="round"
            />
          </svg>
          <span className="brand-cursor-caret" />
        </span>
      </span>
    </div>
  );
}

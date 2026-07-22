"use client";

import { useEffect, useRef, useState } from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;

type DownloadStatus = "idle" | "downloading" | "downloaded" | "error";

const DOWNLOAD_LABELS: Record<
  DownloadStatus,
  { accessible: string; visible: string }
> = {
  idle: { accessible: "Скачать картинку", visible: "Скачать" },
  downloading: { accessible: "Скачивается картинка", visible: "Скачивается…" },
  downloaded: { accessible: "Картинка скачана", visible: "Скачано" },
  error: {
    accessible: "Не удалось скачать картинку. Попробуйте снова",
    visible: "Повторить",
  },
};

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/webp") return "webp";
  return "png";
}

function safeDownloadName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "lumenza-image";
}

function sameOriginMediaUrl(value: string): string {
  try {
    const url = new URL(value, "http://lumenza.local");
    if (url.pathname.startsWith("/media/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return value;
  }
  return value;
}

interface ImageLightboxProps {
  src: string;
  alt: string;
  downloadName: string;
}

export function ImageLightbox({ src, alt, downloadName }: ImageLightboxProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [downloadStatus, setDownloadStatus] =
    useState<DownloadStatus>("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const downloadControllerRef = useRef<AbortController | null>(null);
  const resolvedSrc = sameOriginMediaUrl(src);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      downloadControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function handleDialogKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleDialogKeyboard);
    return () => {
      window.removeEventListener("keydown", handleDialogKeyboard);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  function openPreview() {
    setZoom(MIN_ZOOM);
    setDownloadStatus("idle");
    setOpen(true);
  }

  async function downloadImage() {
    if (downloadStatus === "downloading") return;

    downloadControllerRef.current?.abort();
    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setDownloadStatus("downloading");

    try {
      const response = await fetch(resolvedSrc, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Image download failed (${response.status})`);
      const blob = await response.blob();
      if (!mountedRef.current) return;

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${safeDownloadName(downloadName)}.${extensionForMimeType(blob.type)}`;
      document.body.append(anchor);
      try {
        anchor.click();
        setDownloadStatus("downloaded");
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
    } catch (error) {
      if (!mountedRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      setDownloadStatus("error");
    } finally {
      if (downloadControllerRef.current === controller) {
        downloadControllerRef.current = null;
      }
    }
  }

  const downloadLabel = DOWNLOAD_LABELS[downloadStatus];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPreview}
        aria-label={`Открыть картинку: ${alt}`}
        className="h-full w-full cursor-zoom-in overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolvedSrc} alt={alt} className="h-full w-full object-cover" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex bg-black/80 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Просмотр картинки: ${alt}`}
            className="mx-auto flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/15 bg-bg shadow-2xl"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
              <p className="mr-auto min-w-0 truncate text-sm text-muted">{alt}</p>
              <button
                type="button"
                aria-label="Уменьшить"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
                className="btn-secondary px-2 py-1 disabled:opacity-40"
              >
                −
              </button>
              <span aria-live="polite" className="w-12 text-center font-mono text-xs text-muted">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Увеличить"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
                className="btn-secondary px-2 py-1 disabled:opacity-40"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => void downloadImage()}
                disabled={downloadStatus === "downloading"}
                aria-label={downloadLabel.accessible}
                className={`btn-secondary px-2.5 py-1 ${
                  downloadStatus === "error" ? "text-danger" : ""
                }`}
              >
                <span aria-live="polite">{downloadLabel.visible}</span>
              </button>
              <button
                ref={closeRef}
                type="button"
                aria-label="Закрыть просмотр"
                onClick={() => setOpen(false)}
                className="btn-secondary px-2 py-1"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-black/30">
              <div className="flex min-h-full min-w-full items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedSrc}
                  alt={alt}
                  style={{ width: `${zoom * 100}%` }}
                  className="h-auto max-w-none object-contain transition-[width] duration-200"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

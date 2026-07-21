"use client";

import { useRef } from "react";

interface FileUploadButtonProps {
  accept: string;
  label: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

export function FileUploadButton({
  accept,
  label,
  onFile,
  disabled = false,
  className = "btn-primary",
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

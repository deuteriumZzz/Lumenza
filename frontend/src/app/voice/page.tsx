"use client";

import { useRef, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type SpeechClipEntry, type TranscriptionEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Lost connection while checking status — please refresh the page.";

export default function VoicePage() {
  return (
    <RequireAuth>
      <Voice />
    </RequireAuth>
  );
}

function Voice() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Voice</h1>
      <p className="mt-1 text-sm text-muted">Turn a voice note into text, or text into a spoken clip.</p>

      <TranscribeSection />
      <div className="my-10 border-t border-border" />
      <SpeechSection />
    </div>
  );
}

function TranscribeSection() {
  const { refreshBalance } = useAuth();
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<TranscriptionEntry | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        void submitAudio(blob, "recording.webm");
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone — check browser permissions, or upload a file instead.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void submitAudio(file, file.name);
    event.target.value = "";
  }

  async function submitAudio(blob: Blob, filename: string) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createTranscription(blob, filename);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Not enough credits for this request.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Voice transcription isn't unlocked on your plan yet.");
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  usePolledStatus(
    entry,
    IN_PROGRESS,
    api.transcription,
    (updated) => {
      setEntry(updated);
      if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
    },
    () => setError(STALLED_MESSAGE)
  );

  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">Voice-to-text</h2>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : void startRecording())}
          disabled={submitting}
          className="btn-primary"
        >
          {recording ? "Stop recording" : "Record"}
        </button>
        <label className="btn-secondary cursor-pointer">
          Upload audio file
          <input type="file" accept="audio/*" onChange={onFileChosen} className="hidden" />
        </label>
        {submitting && <span className="text-sm text-muted">Uploading…</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`status-pill ${statusPillClass(entry.status)}`}>
              {entry.status}
            </span>
            {entry.mocked && <span className="status-pill bg-surface-raised">mock</span>}
          </div>
          {entry.status === "ok" && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entry.text}</p>}
          {entry.status === "error" && (
            <p className="mt-2 text-sm text-danger">
              Something went wrong processing this — credits were refunded. Please try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SpeechSection() {
  const { refreshBalance } = useAuth();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<SpeechClipEntry | null>(null);

  async function generate() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createSpeech(trimmed);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Not enough credits for this request.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Text-to-speech isn't unlocked on your plan yet.");
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  usePolledStatus(
    entry,
    IN_PROGRESS,
    api.speechClip,
    (updated) => {
      setEntry(updated);
      if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
    },
    () => setError(STALLED_MESSAGE)
  );

  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">Text-to-speech</h2>
      <div className="mt-3 flex items-end gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Text to turn into a spoken clip…"
          aria-label="Text to speak"
          rows={3}
          maxLength={4000}
          className="input flex-1 resize-none"
        />
        <button type="button" onClick={() => void generate()} disabled={submitting || !text.trim()} className="btn-primary h-fit">
          {submitting ? "Generating…" : "Generate"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`status-pill ${statusPillClass(entry.status)}`}>
              {entry.status}
            </span>
            {entry.mocked && <span className="status-pill bg-surface-raised">mock</span>}
          </div>
          {entry.status === "ok" && entry.audio_url && (
            <audio controls src={entry.audio_url} className="mt-3 w-full">
              <track kind="captions" />
            </audio>
          )}
          {entry.status === "error" && (
            <p className="mt-2 text-sm text-danger">
              Something went wrong processing this — credits were refunded. Please try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

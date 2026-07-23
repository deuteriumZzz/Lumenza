"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type SpeechClipEntry, type TranscriptionEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";
import { FileUploadButton } from "@/components/file-upload-button";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Потеряна связь при проверке статуса — обновите страницу.";

// /voice теперь режим внутри единой студии (/chat).
export default function VoicePage() {
  redirect("/chat");
}

export function Voice() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Голос</h1>
      <p className="mt-1 text-sm text-muted">Превратите голосовую заметку в текст, или текст — в озвучку.</p>

      <LiveVoiceSection />
      <div className="my-10 border-t border-border" />
      <TranscribeSection />
      <div className="my-10 border-t border-border" />
      <SpeechSection />
    </div>
  );
}

const LIVE_INPUT_SAMPLE_RATE = 16000;
// Формат вывода Gemini Live (audio/pcm, 16-bit little-endian, mono) — см.
// media_ops/consumers.py, где вход отправляется как
// audio/pcm;rate=16000, а ответ провайдера ретранслируется как есть.
const LIVE_OUTPUT_SAMPLE_RATE = 24000;

type LiveStatus = "idle" | "connecting" | "live" | "error";

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

// ScriptProcessorNode устарел в пользу AudioWorkletNode, но не требует
// отдельного файла воркета, который пришлось бы грузить из /public —
// для голосового мода, который пока не на GA (нет боевого GOOGLE_API_KEY),
// это осознанно самый простой путь до первой живой проверки.
function downsampleTo16k(buffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === LIVE_INPUT_SAMPLE_RATE) return buffer;
  const ratio = inputSampleRate / LIVE_INPUT_SAMPLE_RATE;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function LiveVoiceSection() {
  const { refreshBalance } = useAuth();
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [mocked, setMocked] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Отдельный контекст воспроизведения на LIVE_OUTPUT_SAMPLE_RATE — вход
  // и выход у Gemini Live идут на разной частоте дискретизации, смешивать
  // их в одном AudioContext означало бы либо неверную скорость
  // воспроизведения, либо постоянный ресемплинг на лету.
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackCursorRef = useRef(0);

  function playIncomingPCM(bytes: ArrayBuffer) {
    const ctx = playbackContextRef.current;
    if (!ctx) return;
    const samples = new Int16Array(bytes);
    const audioBuffer = ctx.createBuffer(1, samples.length, LIVE_OUTPUT_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, playbackCursorRef.current);
    sourceNode.start(startAt);
    playbackCursorRef.current = startAt + audioBuffer.duration;
  }

  function cleanup() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    void playbackContextRef.current?.close();
    playbackContextRef.current = null;
    playbackCursorRef.current = 0;
    wsRef.current = null;
  }

  async function startCall() {
    setError(null);
    setInsufficientCredits(false);
    setMocked(null);
    setStatus("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/voice/`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data) as
            | { type: "ready"; mocked: boolean }
            | { type: "mock_ack"; bytes: number }
            | { type: "error"; message: string };
          if (message.type === "ready") {
            setMocked(message.mocked);
            setStatus("live");
          } else if (message.type === "error") {
            if (message.message === "insufficient_credits") setInsufficientCredits(true);
            setError(
              message.message === "insufficient_credits"
                ? "Недостаточно кредитов для звонка."
                : "Провайдер голосового режима сейчас недоступен."
            );
            setStatus("error");
          }
          return;
        }
        playIncomingPCM(event.data as ArrayBuffer);
      };

      ws.onclose = () => {
        cleanup();
        setStatus((current) => (current === "error" ? current : "idle"));
        void refreshBalance();
      };

      ws.onerror = () => {
        setError("Сбой соединения голосового режима.");
        setStatus("error");
      };

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      playbackContextRef.current = new AudioContext({ sampleRate: LIVE_OUTPUT_SAMPLE_RATE });

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const downsampled = downsampleTo16k(input, audioContext.sampleRate);
        ws.send(floatTo16BitPCM(downsampled));
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch {
      setError("Не удалось получить доступ к микрофону — проверьте разрешения браузера.");
      setStatus("error");
      cleanup();
    }
  }

  function endCall() {
    wsRef.current?.close();
    cleanup();
    setStatus("idle");
  }

  useEffect(() => () => {
    wsRef.current?.close();
    cleanup();
  }, []);

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">Голосовой разговор в реальном времени</h2>
        {status === "live" && mocked !== null && (
          <span role="status" className={`status-pill ${mocked ? "bg-surface-raised" : "bg-primary/10 text-primary"}`}>
            {mocked ? "мок" : "в эфире"}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Живой разговор с ИИ голосом, как в голосовом режиме ChatGPT — говорите, ответ приходит сразу же.
      </p>

      <div className="mt-3">
        {status === "idle" || status === "error" ? (
          <button type="button" onClick={() => void startCall()} className="btn-primary">
            Начать разговор
          </button>
        ) : (
          <button type="button" onClick={endCall} className="btn-secondary">
            {status === "connecting" ? "Подключаемся…" : "Завершить разговор"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
          {insufficientCredits && (
            <Link href="/pricing" className="ml-2 font-medium underline">
              К оплате
            </Link>
          )}
        </p>
      )}
    </section>
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
      setError("Не удалось получить доступ к микрофону — проверьте разрешения браузера, либо загрузите файл.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
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
        setError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Расшифровка голоса ещё не разблокирована на вашем тарифе.");
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
      <h2 className="text-sm font-semibold text-ink">Голос в текст</h2>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (recording ? stopRecording() : void startRecording())}
          disabled={submitting}
          className="btn-primary"
        >
          {recording ? "Остановить запись" : "Записать"}
        </button>
        <FileUploadButton
          accept="audio/*"
          label="Загрузить аудиофайл"
          onFile={(file) => void submitAudio(file, file.name)}
          disabled={submitting}
          className="btn-secondary"
        />
        {submitting && <span className="text-sm text-muted">Загружаем…</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span role="status" className={`status-pill ${statusPillClass(entry.status)}`}>
              {entry.status}
            </span>
            {entry.mocked && <span className="status-pill bg-surface-raised">мок</span>}
          </div>
          {entry.status === "ok" && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entry.text}</p>}
          {entry.status === "error" && (
            <p className="mt-2 text-sm text-danger">
              Что-то пошло не так при обработке — кредиты возвращены. Попробуйте ещё раз.
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
        setError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Озвучка текста ещё не разблокирована на вашем тарифе.");
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
      <h2 className="text-sm font-semibold text-ink">Текст в озвучку</h2>
      <div className="mt-3 flex items-end gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Текст, который нужно озвучить…"
          aria-label="Текст для озвучки"
          rows={3}
          maxLength={4000}
          className="input flex-1 resize-none"
        />
        <button type="button" onClick={() => void generate()} disabled={submitting || !text.trim()} className="btn-primary h-fit">
          {submitting ? "Генерируем…" : "Сгенерировать"}
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
            <span role="status" className={`status-pill ${statusPillClass(entry.status)}`}>
              {entry.status}
            </span>
            {entry.mocked && <span className="status-pill bg-surface-raised">мок</span>}
          </div>
          {entry.status === "ok" && entry.audio_url && (
            <audio controls src={entry.audio_url} className="mt-3 w-full">
              <track kind="captions" />
            </audio>
          )}
          {entry.status === "error" && (
            <p className="mt-2 text-sm text-danger">
              Что-то пошло не так при обработке — кредиты возвращены. Попробуйте ещё раз.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

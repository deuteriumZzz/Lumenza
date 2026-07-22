import Link from "next/link";
import { TelegramCta } from "@/components/telegram-cta";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-tight text-ink">Lumenza</span>
        <div className="flex items-center gap-3 text-sm">
          <TelegramCta className="text-muted transition-colors duration-150 hover:text-ink" />
          <Link href="/login" className="text-muted transition-colors duration-150 hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-primary px-3.5 py-1.5 font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
        <h1
          className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-5xl"
          style={{ textWrap: "balance" }}
        >
          One workspace for every AI request your content work needs.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Fast, smart, or cheap — Lumenza routes each request across OpenAI, Anthropic,
          and Gemini automatically, with fallback if a provider fails. Every request
          shows its cost before your balance moves.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
          >
            Sign in →
          </Link>
        </div>

        <dl className="mt-20 grid grid-cols-1 gap-8 border-t border-border pt-10 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">3</dt>
            <dd className="mt-1 text-sm text-muted">providers routed automatically</dd>
          </div>
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">fast / smart / cheap</dt>
            <dd className="mt-1 text-sm text-muted">explicit modes, no guessing which model runs</dd>
          </div>
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">every request</dt>
            <dd className="mt-1 text-sm text-muted">logged with exact cost and latency</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

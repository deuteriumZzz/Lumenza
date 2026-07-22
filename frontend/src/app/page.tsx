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
            Войти
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-primary px-3.5 py-1.5 font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Начать
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
        <h1
          className="text-balance text-4xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-5xl"
          style={{ textWrap: "balance" }}
        >
          Одно рабочее пространство для всех AI-задач вашего контента.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          Быстро, умно или дёшево — Lumenza сам распределяет каждый запрос между OpenAI,
          Anthropic и Gemini, с автоматическим резервным вариантом при сбое провайдера.
          Стоимость каждого запроса видна ещё до списания с баланса.
        </p>
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            Создать аккаунт
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
          >
            Войти →
          </Link>
        </div>

        <dl className="mt-20 grid grid-cols-1 gap-8 border-t border-border pt-10 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">3</dt>
            <dd className="mt-1 text-sm text-muted">провайдера подключены автоматически</dd>
          </div>
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">быстро / умно / дёшево</dt>
            <dd className="mt-1 text-sm text-muted">явные режимы — не гадаем, какая модель ответит</dd>
          </div>
          <div>
            <dt className="font-mono text-2xl tabular-nums text-ink">каждый запрос</dt>
            <dd className="mt-1 text-sm text-muted">логируется с точной стоимостью и задержкой</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

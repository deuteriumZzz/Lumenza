import Link from "next/link";
import { TelegramCta } from "@/components/telegram-cta";
import { ModelMarquee } from "@/components/model-marquee";
import { LumenzaBrand } from "@/components/lumenza-brand";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <LumenzaBrand href="/" />
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

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20 sm:py-24">
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-primary">
          Один интерфейс · десятки моделей
        </p>
        <h1
          className="max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-6xl"
          style={{ textWrap: "balance" }}
        >
          Ведущие AI-модели — в одном живом пространстве.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Общайтесь, исследуйте, создавайте изображения, работайте с голосом и документами.
          Lumenza подберёт модель автоматически или позволит выбрать её вручную — с прозрачной
          стоимостью и резервным маршрутом при сбое.
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

        <section
          aria-label="Возможности Lumenza"
          className="mt-16 grid gap-3 border-t border-border/70 pt-8 md:grid-cols-[1.15fr_0.85fr_1fr]"
        >
          <article className="rounded-xl bg-surface/70 p-5 backdrop-blur-sm">
            <div className="font-mono text-xs text-primary">01</div>
            <h2 className="mt-5 text-lg font-medium text-ink">Исследования и знания</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Поиск в интернете, развёрнутые ответы, перевод и работа с документами.
            </p>
          </article>
          <article className="rounded-xl bg-surface/50 p-5 backdrop-blur-sm md:translate-y-4">
            <div className="font-mono text-xs text-primary">02</div>
            <h2 className="mt-5 text-lg font-medium text-ink">Творческая студия</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Изображения, голос, распознавание и анализ визуальных материалов.
            </p>
          </article>
          <article className="rounded-xl bg-surface/70 p-5 backdrop-blur-sm">
            <div className="font-mono text-xs text-primary">03</div>
            <h2 className="mt-5 text-lg font-medium text-ink">Работа и бизнес</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Анализ, планирование и идеи. Маркетинг и контент — отдельный набор сценариев,
              а не ограничение продукта.
            </p>
          </article>
        </section>
      </section>

      <div className="border-t border-border/60 px-6 py-3">
        <ModelMarquee />
      </div>
    </div>
  );
}

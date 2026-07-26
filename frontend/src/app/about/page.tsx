import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
        О продукте
      </p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Одна рабочая среда для разных моделей и форматов
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
        Lumenza объединяет ведущие AI-модели в одном аккаунте. Чат,
        исследование, изображения, голос и документы используют общий
        баланс и сохраняют историю независимо от того, открыли вы сайт или
        Telegram Mini App.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          ["Один аккаунт", "Баланс, тариф и история синхронизированы между web и Telegram."],
          ["Умный маршрут", "Lumenza подбирает подходящую модель и использует резервный вариант при сбое."],
          ["Прозрачность", "После каждого результата видны модель и списанные кредиты."],
        ].map(([title, description]) => (
          <article key={title} className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-medium text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </article>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/chat" className="btn-primary">
          Открыть чат
        </Link>
        <Link href="/studio" className="btn-secondary">
          Перейти в Студию
        </Link>
      </div>
    </div>
  );
}

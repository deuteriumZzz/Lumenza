import Link from "next/link";
import { LumenzaMark } from "@/components/lumenza-brand";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <LumenzaMark className="size-8 opacity-70" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Страница не найдена
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Такой страницы не существует — возможно, ссылка устарела или адрес введён неточно.
      </p>
      <Link href="/chat" className="btn-primary mt-8">
        Перейти в чат
      </Link>
    </div>
  );
}

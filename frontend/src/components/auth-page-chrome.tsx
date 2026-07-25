import { ModelMarquee } from "@/components/model-marquee";
import { LumenzaBrand } from "@/components/lumenza-brand";

// Общая обёртка для /login и /register — обе страницы самостоятельные,
// без общего layout.tsx, так что оборачиваем разметку напрямую, а не
// заводим новый route-group layout ради двух декоративных слоёв.
//
// На /login и /register сейчас нет <Nav> вообще (он скрывается для
// анонимного пользователя, components/nav.tsx: `if (!user) return null`)
// — то есть без этой ссылки со страницы входа физически некуда вернуться
// на посадочную `/`, у которой уже есть свой заголовок/бренд. Свой
// логотип здесь, а не рендер <Nav>, — Nav несёт баланс/меню/выход,
// ничего из этого не имеет смысла для неавторизованного пользователя.
export function AuthPageChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="px-6 py-6">
        <LumenzaBrand href="/" />
      </div>
      {children}
      <div className="border-t border-border px-6 py-3">
        <ModelMarquee />
      </div>
    </div>
  );
}

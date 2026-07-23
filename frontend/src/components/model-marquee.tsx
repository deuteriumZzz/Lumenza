// Провайдеры/модели, реально подключённые в проекте — см.
// backend/providers/registry.py + services.py TASK_ROUTES. Список
// специально короткий и говорящий, а не исчерпывающий (там десятки
// NVIDIA-кандидатов в запасных вариантах) — это витрина "мы агрегатор",
// не техническая документация.
const ITEMS = [
  "OpenAI GPT-4o",
  "Anthropic Claude 3.5",
  "Google Gemini",
  "NVIDIA Nemotron",
  "DeepSeek",
  "Tavily Search",
];

// Бесшовный бесконечный скролл — контент продублирован дважды подряд,
// @keyframes уезжает ровно на -50% (globals.css: model-marquee-scroll).
// Отступ между пунктами задан на каждом <span> (pr-8), а не через gap на
// внешнем flex-контейнере — gap на плоском списке из 12 элементов даёт
// 11 промежутков, а не 12, из-за чего -50% попадает на пол-отступа мимо
// начала второй копии (виден рывок на стыке). Одинаковый паддинг на
// каждом элементе, включая последний элемент каждой копии, гарантирует,
// что обе копии — ровно одинаковой ширины, и -50% всегда попадает точно
// на начало второй копии.
export function ModelMarquee() {
  return (
    <div aria-hidden="true" className="overflow-hidden select-none">
      <div className="flex w-max animate-[model-marquee-scroll_28s_linear_infinite] text-xs tracking-wide text-muted uppercase">
        {[...ITEMS, ...ITEMS].map((item, index) => (
          <span key={index} className="whitespace-nowrap pr-8">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

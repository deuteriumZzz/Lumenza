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
// @keyframes уезжает ровно на -50% (globals.css: model-marquee-scroll),
// так что конец первой копии стыкуется с началом второй без видимого шва.
export function ModelMarquee() {
  return (
    <div aria-hidden="true" className="overflow-hidden select-none">
      <div className="flex w-max animate-[model-marquee-scroll_28s_linear_infinite] gap-8 text-xs tracking-wide text-muted uppercase">
        {[...ITEMS, ...ITEMS].map((item, index) => (
          <span key={index} className="whitespace-nowrap">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

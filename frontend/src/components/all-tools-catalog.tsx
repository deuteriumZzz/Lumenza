"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LumenzaMark } from "@/components/lumenza-brand";
import { redesignMotion } from "@/lib/motion";

type ToolCategory = "Research" | "Data" | "Writing" | "Code" | "Images" | "Presentations" | "Audio" | "Documents" | "Automation" | "Video";

interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  route: string;
  status: "Live" | "Preview";
  accent: string;
  capabilities: string;
  bestFor: string;
  outputs: string;
  integrations: string;
}

const TOOLS: ToolDefinition[] = [
  { id: "research-insights", name: "Research & insights", category: "Research", description: "Глубокое исследование с проверенными источниками, выводами и цитированием.", route: "/agents?category=research", status: "Live", accent: "01", capabilities: "Веб-поиск, проверка источников, анализ трендов, суммаризация", bestFor: "Маркетинговые исследования, конкурентный анализ, due diligence", outputs: "Отчёты, сводки, цитаты, брифы с выводами", integrations: "Chat, Knowledge, Data Analysis" },
  { id: "data-analysis", name: "Data Analysis", category: "Data", description: "Анализ, очистка и визуализация данных для понятных решений.", route: "/chat", status: "Live", accent: "02", capabilities: "Очистка данных, статистика, визуализация, поиск закономерностей", bestFor: "Отчётность, метрики продукта, финансовый анализ", outputs: "Таблицы, графики, выводы по данным", integrations: "Chat, Knowledge" },
  { id: "content-creation", name: "Content creation", category: "Writing", description: "Статьи, маркетинговые материалы и структурированные публикации.", route: "/agents?category=content", status: "Live", accent: "03", capabilities: "Тексты, редактура, SEO-структура, тон и стиль", bestFor: "Блог, соцсети, email-рассылки, лендинги", outputs: "Готовые тексты и черновики публикаций", integrations: "Agents, Knowledge" },
  { id: "code-assistant", name: "Code assistant", category: "Code", description: "Написание, объяснение и отладка кода в рабочем диалоге.", route: "/chat", status: "Live", accent: "04", capabilities: "Генерация кода, объяснение, отладка, ревью", bestFor: "Прототипы, рефакторинг, разбор незнакомого кода", outputs: "Фрагменты кода, патчи, пояснения", integrations: "Chat" },
  { id: "create-image", name: "Create image", category: "Images", description: "Создание изображения по текстовому описанию и визуальной идее.", route: "/studio?mode=image", status: "Live", accent: "05", capabilities: "Text-to-image, стили, референсы, вариации", bestFor: "Обложки, иллюстрации, визуалы для соцсетей", outputs: "Изображения в высоком разрешении", integrations: "Studio" },
  { id: "presentation-builder", name: "Presentation Builder", category: "Presentations", description: "Структура, сторителлинг и материалы для профессиональной презентации.", route: "/agents?category=documents", status: "Live", accent: "06", capabilities: "Структура слайдов, сторителлинг, тезисы", bestFor: "Питчи, отчёты для команды, презентации для клиентов", outputs: "План презентации и текстовое содержимое слайдов", integrations: "Agents, Knowledge" },
  { id: "text-to-speech", name: "Text to speech", category: "Audio", description: "Естественная озвучка текста доступными голосовыми моделями.", route: "/studio?mode=audio", status: "Live", accent: "07", capabilities: "Синтез речи, выбор голоса, темп и интонация", bestFor: "Озвучка роликов, подкастов, голосовых интерфейсов", outputs: "Аудиофайл озвученного текста", integrations: "Studio" },
  { id: "voice-cloning", name: "Voice cloning", category: "Audio", description: "Подготовка голосового профиля и референса.", route: "/studio?mode=audio", status: "Live", accent: "08", capabilities: "Голосовой референс, клонирование тембра", bestFor: "Персонализированная озвучка, брендовый голос", outputs: "Голосовой профиль для дальнейшей озвучки", integrations: "Studio" },
  { id: "document-intelligence", name: "Document intelligence", category: "Documents", description: "Извлечение, суммаризация и анализ документов.", route: "/knowledge", status: "Live", accent: "09", capabilities: "OCR, суммаризация, извлечение фактов, поиск по смыслу", bestFor: "Контракты, отчёты, база знаний команды", outputs: "Структурированные сводки и проиндексированные источники", integrations: "Knowledge, Chat" },
  { id: "automation-builder", name: "Automation builder", category: "Automation", description: "Проектирование повторяемых сценариев и подтверждаемых действий.", route: "/automations", status: "Live", accent: "10", capabilities: "Триггеры, шаги сценария, подтверждение перед действием", bestFor: "Повторяющиеся рабочие процессы, интеграции между инструментами", outputs: "Работающий автоматизированный сценарий", integrations: "Automations, Agents" },
  { id: "create-video", name: "Create video", category: "Video", description: "Подготовка сцены, движения камеры и стартового кадра. Генерация станет доступна после подключения провайдера.", route: "/studio?mode=video", status: "Preview", accent: "11", capabilities: "Раскадровка сцены, движение камеры, стартовый кадр", bestFor: "Концепт-видео, превью сцены перед генерацией", outputs: "Пока недоступно — провайдер генерации видео не подключён", integrations: "Studio" },
];

const CATEGORIES = ["All", "Research", "Data", "Writing", "Code", "Images", "Presentations", "Audio", "Documents", "Automation"] as const;
type CatalogCategory = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  All: "All",
  Research: "Research",
  Data: "Data & Analytics",
  Writing: "Writing",
  Code: "Code",
  Images: "Images",
  Presentations: "Presentations",
  Audio: "Audio",
  Documents: "Documents",
  Automation: "Automation",
};

function normalizeCategory(value?: string | null): CatalogCategory {
  if (!value) return "All";
  const match = CATEGORIES.find((category) => category.toLocaleLowerCase() === value.toLocaleLowerCase());
  return match ?? "All";
}

// Inspector fact-row icons — traced from
// docs/redesign-references/detail-crops/all-tools/05-right-inspector.png.
function FactIcon({ variant }: { variant: "capabilities" | "bestFor" | "outputs" | "integrations" }) {
  const common = { viewBox: "0 0 20 20", className: "mr-1.5 inline size-3.5 shrink-0 align-[-2px]", fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  if (variant === "capabilities") return <svg aria-hidden="true" {...common}><circle cx="10" cy="6.5" r="2.7" /><path d="M4.5 16c0-3 2.5-5.3 5.5-5.3s5.5 2.3 5.5 5.3" strokeLinecap="round" /></svg>;
  if (variant === "bestFor") return <svg aria-hidden="true" {...common}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.6" /></svg>;
  if (variant === "outputs") return <svg aria-hidden="true" {...common}><path d="M4 5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 16 5v6.5a1.5 1.5 0 0 1-1.5 1.5H9l-3 3v-3H5.5A1.5 1.5 0 0 1 4 11.5Z" strokeLinejoin="round" /></svg>;
  return <svg aria-hidden="true" {...common}><rect x="3.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="11.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="3.5" y="11.5" width="5" height="5" rx="1.2" /><rect x="11.5" y="11.5" width="5" height="5" rx="1.2" /></svg>;
}

function ToolIcon({ category }: { category: ToolCategory }) {
  const common = { viewBox: "0 0 24 24", className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  switch (category) {
    case "Research":
      return <svg aria-hidden="true" {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m19 19-4.3-4.3" strokeLinecap="round" /></svg>;
    case "Data":
      return <svg aria-hidden="true" {...common}><path d="M5 19V9m7 10V5m7 14v-7" strokeLinecap="round" /><path d="M3.5 19.5h17" strokeLinecap="round" /></svg>;
    case "Writing":
      return <svg aria-hidden="true" {...common}><path d="M6 19.5 4 20l.5-2 11-11 2 2Z" strokeLinejoin="round" /><path d="m14 6.5 2-2 2 2-2 2Z" strokeLinejoin="round" /></svg>;
    case "Code":
      return <svg aria-hidden="true" {...common}><path d="m9 8-4.5 4L9 16M15 8l4.5 4-4.5 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "Images":
      return <svg aria-hidden="true" {...common}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="10" r="1.75" /><path d="m5 17 4.5-4.5 3 3L18 9l1.5 1.5" strokeLinejoin="round" /></svg>;
    case "Presentations":
      return <svg aria-hidden="true" {...common}><rect x="3.5" y="5" width="17" height="11.5" rx="1.5" /><path d="M9 20h6M12 16.5V20" strokeLinecap="round" /></svg>;
    case "Audio":
      return <svg aria-hidden="true" {...common}><path d="M4 10v4h3.5L12 17.5v-11L7.5 10Z" strokeLinejoin="round" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" strokeLinecap="round" /></svg>;
    case "Documents":
      return <svg aria-hidden="true" {...common}><path d="M7 3.5h7l3 3v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5v3h3M9 12h6M9 15.5h6" strokeLinecap="round" /></svg>;
    case "Automation":
      return <svg aria-hidden="true" {...common}><path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5Z" strokeLinejoin="round" /></svg>;
    case "Video":
    default:
      return <svg aria-hidden="true" {...common}><rect x="3.5" y="6" width="12" height="12" rx="1.5" /><path d="m20.5 8.5-5 3.5 5 3.5Z" strokeLinejoin="round" /></svg>;
  }
}

export function AllToolsCatalog({
  initialTool,
  initialCategory,
  onSelectionChange,
}: {
  initialTool?: string | null;
  initialCategory?: string | null;
  onSelectionChange?: (toolId: string) => void;
}) {
  const requestedCategory = normalizeCategory(initialCategory);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogCategory>(requestedCategory);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState(() => {
    if (TOOLS.some((tool) => tool.id === initialTool)) return initialTool!;
    return TOOLS.find((tool) => requestedCategory === "All" || tool.category === requestedCategory)?.id ?? TOOLS[0].id;
  });
  const selected = TOOLS.find((tool) => tool.id === selectedId) ?? TOOLS[0];
  const isFavorite = favorites.has(selected.id);
  const shouldReduceMotion = useReducedMotion();

  function toggleFavorite() {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      return next;
    });
  }
  const visibleTools = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return TOOLS.filter((tool) =>
      (category === "All" || tool.category === category)
      && `${tool.name} ${tool.description} ${tool.category}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [category, query]);

  function selectTool(tool: ToolDefinition) {
    setSelectedId(tool.id);
    onSelectionChange?.(tool.id);
  }

  return (
    <div className="all-tools-layout">
      <div className="all-tools-catalog-main">
        <div className="all-tools-toolbar">
          <label className="all-tools-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Поиск инструментов"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools and capabilities"
            />
          </label>
          <nav aria-label="Категории инструментов" className="all-tools-filters">
            {CATEGORIES.map((item) => (
              <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{CATEGORY_LABELS[item]}</button>
            ))}
          </nav>
        </div>

        <section className="all-tools-featured" aria-label="Рекомендуемый инструмент">
          <div className="all-tools-featured-header">
            <span className="all-tools-featured-icon" aria-hidden="true"><ToolIcon category="Data" /></span>
            <span className="all-tools-featured-badge">Popular</span>
          </div>
          <div className="all-tools-featured-visual" aria-hidden="true">
            <span className="lumenza-orbit lumenza-orbit-outermost" />
            <span className="lumenza-orbit lumenza-orbit-outer" />
            <span className="lumenza-orbit lumenza-orbit-inner" />
            <LumenzaMark className="size-10" />
          </div>
          <div className="all-tools-featured-copy">
            <span className="all-tools-featured-eyebrow">Featured capability</span>
            <h2>Market Research Report</h2>
            <p>Комплексное исследование рынка с трендами, конкурентным анализом и прогнозами для более сильных решений.</p>
            <ul className="all-tools-featured-tags">
              <li><span aria-hidden="true">✓</span> Тренды и прогнозы</li>
              <li><span aria-hidden="true">✓</span> Конкурентный анализ</li>
              <li><span aria-hidden="true">✓</span> Оценка рынка</li>
            </ul>
            <Link href="/agents?category=research">Запустить анализ <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <h3 className="all-tools-browse-heading">Browse tools</h3>
        <ul aria-label="Каталог инструментов" className="all-tools-grid">
          {visibleTools.map((tool) => (
            <li key={tool.id}>
              <button
                type="button"
                aria-label={`${tool.name} · ${tool.status}`}
                aria-pressed={selected.id === tool.id}
                onClick={() => selectTool(tool)}
                className="all-tools-card"
              >
                <span className="all-tools-card-icon" aria-hidden="true"><ToolIcon category={tool.category} /></span>
                <strong>{tool.name}</strong>
                <small>{tool.description}</small>
                <span className="all-tools-card-link">
                  {tool.status === "Live" ? "Open Tool" : "Preview"} <span aria-hidden="true">→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {visibleTools.length === 0 ? <p role="status" className="studio-catalog-empty">Ничего не найдено.</p> : null}
      </div>

        <motion.aside
          key={selected.id}
          aria-label={selected.name}
          className="all-tools-inspector"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : redesignMotion.panel}
        >
          <div className="all-tools-inspector-visual" aria-hidden="true"><ToolIcon category={selected.category} /></div>
          <p className="workspace-eyebrow">{selected.category} capability</p>
          <div className="all-tools-inspector-title"><h2>{selected.name}</h2><span>{selected.status}</span></div>
          <p>{selected.description}</p>
          <dl className="all-tools-inspector-facts">
            <div><dt><FactIcon variant="capabilities" />Capabilities</dt><dd>{selected.capabilities}</dd></div>
            <div><dt><FactIcon variant="bestFor" />Best for</dt><dd>{selected.bestFor}</dd></div>
            <div><dt><FactIcon variant="outputs" />Outputs</dt><dd>{selected.outputs}</dd></div>
            <div><dt><FactIcon variant="integrations" />Integrations</dt><dd>{selected.integrations}</dd></div>
          </dl>
          <dl>
            <div><dt>Workspace</dt><dd>{selected.route.startsWith("/studio") ? "Studio" : selected.route.startsWith("/agents") ? "Agents" : selected.route.startsWith("/knowledge") ? "Knowledge" : "Lumenza"}</dd></div>
            <div><dt>Availability</dt><dd>{selected.status === "Live" ? "Ready" : "Provider preview"}</dd></div>
          </dl>
          <Link href={selected.route} aria-label={`Открыть ${selected.name}`} className="workspace-primary-button">
            {selected.status === "Live" ? "Открыть инструмент" : "Подготовить проект"}<span aria-hidden="true">↗</span>
          </Link>
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={isFavorite}
            className="all-tools-favorite-button"
          >
            <span aria-hidden="true">{isFavorite ? "★" : "☆"}</span>
            {isFavorite ? "В избранном" : "Добавить в избранное"}
          </button>
          {selected.status === "Preview" ? <small>Провайдер генерации пока не подключён; интерфейс честно сохраняет режим Preview.</small> : null}
        </motion.aside>
    </div>
  );
}

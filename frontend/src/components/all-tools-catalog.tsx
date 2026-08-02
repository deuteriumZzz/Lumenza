"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ToolCategory = "Research" | "Data" | "Writing" | "Code" | "Images" | "Presentations" | "Audio" | "Documents" | "Automation" | "Video";

interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  route: string;
  status: "Live" | "Preview";
  accent: string;
}

const TOOLS: ToolDefinition[] = [
  { id: "research-insights", name: "Research & Insights", category: "Research", description: "Глубокое исследование с проверенными источниками, выводами и цитированием.", route: "/agents?category=research", status: "Live", accent: "01" },
  { id: "data-analysis", name: "Data Analysis", category: "Data", description: "Анализ, очистка и визуализация данных для понятных решений.", route: "/chat", status: "Live", accent: "02" },
  { id: "content-creation", name: "Content Creation", category: "Writing", description: "Статьи, маркетинговые материалы и структурированные публикации.", route: "/agents?category=content", status: "Live", accent: "03" },
  { id: "code-assistant", name: "Code Assistant", category: "Code", description: "Написание, объяснение и отладка кода в рабочем диалоге.", route: "/chat", status: "Live", accent: "04" },
  { id: "create-image", name: "Create image", category: "Images", description: "Создание изображения по текстовому описанию и визуальной идее.", route: "/studio?mode=image", status: "Live", accent: "05" },
  { id: "presentation-builder", name: "Presentation Builder", category: "Presentations", description: "Структура, сторителлинг и материалы для профессиональной презентации.", route: "/agents?category=documents", status: "Live", accent: "06" },
  { id: "text-to-speech", name: "Text to speech", category: "Audio", description: "Естественная озвучка текста доступными голосовыми моделями.", route: "/studio?mode=audio", status: "Live", accent: "07" },
  { id: "voice-cloning", name: "Voice cloning", category: "Audio", description: "Подготовка голосового профиля и референса.", route: "/studio?mode=audio", status: "Live", accent: "08" },
  { id: "document-intelligence", name: "Document Intelligence", category: "Documents", description: "Извлечение, суммаризация и анализ документов.", route: "/knowledge", status: "Live", accent: "09" },
  { id: "automation-builder", name: "Automation Builder", category: "Automation", description: "Проектирование повторяемых сценариев и подтверждаемых действий.", route: "/automations", status: "Live", accent: "10" },
  { id: "create-video", name: "Create video", category: "Video", description: "Подготовка сцены, движения камеры и стартового кадра. Генерация станет доступна после подключения провайдера.", route: "/studio?mode=video", status: "Preview", accent: "11" },
];

const CATEGORIES = ["All", "Research", "Data", "Writing", "Code", "Images", "Presentations", "Audio", "Documents", "Automation"] as const;
type CatalogCategory = (typeof CATEGORIES)[number];

function normalizeCategory(value?: string | null): CatalogCategory {
  if (!value) return "All";
  const match = CATEGORIES.find((category) => category.toLocaleLowerCase() === value.toLocaleLowerCase());
  return match ?? "All";
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
  const [selectedId, setSelectedId] = useState(() => {
    if (TOOLS.some((tool) => tool.id === initialTool)) return initialTool!;
    return TOOLS.find((tool) => requestedCategory === "All" || tool.category === requestedCategory)?.id ?? TOOLS[0].id;
  });
  const selected = TOOLS.find((tool) => tool.id === selectedId) ?? TOOLS[0];
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
              <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
            ))}
          </nav>
        </div>

        <section className="all-tools-featured" aria-label="Рекомендуемый инструмент">
          <div><span>Featured capability</span><h2>Market Research Report</h2><p>Тренды, конкурентный анализ и проверенные выводы для более сильных решений.</p></div>
          <Link href="/agents?category=research">Запустить анализ <span aria-hidden="true">↗</span></Link>
        </section>

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
                <span className="all-tools-card-index" aria-hidden="true">{tool.accent}</span>
                <span className="all-tools-card-copy"><strong>{tool.name}</strong><small>{tool.category}</small></span>
                <em>{tool.status}</em>
              </button>
            </li>
          ))}
        </ul>
        {visibleTools.length === 0 ? <p role="status" className="studio-catalog-empty">Ничего не найдено.</p> : null}
      </div>

      <aside aria-label={selected.name} className="all-tools-inspector">
        <div className="all-tools-inspector-visual" aria-hidden="true"><span>{selected.accent}</span></div>
        <p className="workspace-eyebrow">{selected.category} capability</p>
        <div className="all-tools-inspector-title"><h2>{selected.name}</h2><span>{selected.status}</span></div>
        <p>{selected.description}</p>
        <dl>
          <div><dt>Workspace</dt><dd>{selected.route.startsWith("/studio") ? "Studio" : selected.route.startsWith("/agents") ? "Agents" : selected.route.startsWith("/knowledge") ? "Knowledge" : "Lumenza"}</dd></div>
          <div><dt>Availability</dt><dd>{selected.status === "Live" ? "Ready" : "Provider preview"}</dd></div>
        </dl>
        <Link href={selected.route} aria-label={`Открыть ${selected.name}`} className="workspace-primary-button">
          {selected.status === "Live" ? "Открыть инструмент" : "Подготовить проект"}<span aria-hidden="true">↗</span>
        </Link>
        {selected.status === "Preview" ? <small>Провайдер генерации пока не подключён; интерфейс честно сохраняет режим Preview.</small> : null}
      </aside>
    </div>
  );
}

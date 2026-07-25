import type { Task } from "@/lib/api";

export interface TaskDefinition {
  value: Task;
  label: string;
  hint: string;
  group: "core" | "research" | "business";
}

export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    value: "repurpose",
    label: "Универсальный чат",
    hint: "Объяснить, сравнить, переписать или помочь с повседневной задачей",
    group: "core",
  },
  {
    value: "longform",
    label: "Подробный ответ",
    hint: "Развёрнутый материал, инструкция или структурированный документ",
    group: "core",
  },
  {
    value: "translation",
    label: "Перевод",
    hint: "Перевести или локализовать текст с учётом контекста",
    group: "core",
  },
  {
    value: "search",
    label: "Поиск в интернете",
    hint: "Ответ с опорой на актуальные источники",
    group: "research",
  },
  {
    value: "hook",
    label: "Идеи и креатив",
    hint: "Варианты концепций, названий и сильных первых формулировок",
    group: "business",
  },
  {
    value: "content_plan",
    label: "Планирование и стратегия",
    hint: "План действий, публикаций или проекта",
    group: "business",
  },
  {
    value: "hashtags",
    label: "Теги и охват",
    hint: "Маркетинговые теги и структура распространения",
    group: "business",
  },
];

export const TASK_GROUPS = [
  { key: "core", label: "Текст и знания" },
  { key: "research", label: "Исследование" },
  { key: "business", label: "Бизнес и контент" },
] as const;

export const TASK_LABELS: Record<string, string> = Object.fromEntries(
  TASK_DEFINITIONS.map((option) => [option.value, option.label]),
);

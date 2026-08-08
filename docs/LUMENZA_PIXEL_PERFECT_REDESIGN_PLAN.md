# Lumenza — Pixel-Perfect Redesign Plan

## Статус документа

Этот документ — основной план нового визуального направления Lumenza.

Предыдущий преимущественно чёрно-оранжевый интерфейс считается неактуальным и не должен использоваться как визуальный источник. Существующий код можно переиспользовать только для бизнес-логики, API, данных и проверенных пользовательских сценариев.

Новый интерфейс собирается заново по шести утверждённым референсам:

1. Chat
2. Agents
3. Studio
4. Account / Profile
5. Knowledge
6. All Tools

Референсы являются единственным визуальным источником истины. Итоговая реализация должна повторять их композицию, размеры, плотность, палитру, типографику, панели, состояния и анимации максимально близко к pixel-perfect.

---

## 1. Цель

Собрать Lumenza как единое премиальное AI-пространство, а не набор визуально независимых страниц.

Результат должен обеспечивать:

- один постоянный application shell;
- неизменяемое боковое меню на всех рабочих маршрутах;
- общую систему цветов, типографики, отступов и компонентов;
- бесшовные переходы без полноэкранной перезагрузки;
- shared-element переход Chat → Agents через центральное ядро Lumenza;
- функциональные панели, меню, фильтры и инспекторы;
- точное соответствие шести утверждённым скриншотам;
- адаптивность без разрушения исходной композиции;
- сохранение существующей бизнес-логики и API.

---

## 2. Что больше не актуально

Нельзя использовать как основу нового дизайна:

- старую чёрно-оранжевую визуальную систему;
- чистый чёрный фон `#000`;
- яркие оранжевые заливки большинства активных элементов;
- разные структуры сайдбара на разных маршрутах;
- отдельную загрузочную сцену для каждой страницы;
- полноэкранные route overlays;
- generic dashboard-композиции;
- чрезмерный glassmorphism;
- фиолетово-синие AI-градиенты;
- бессистемные glow-эффекты;
- декоративные кнопки без реального действия;
- карточки внутри карточек без функциональной причины.

---

## 3. Источник истины и метод реализации

Для каждого экрана необходимо:

1. открыть соответствующий референс в полном размере;
2. зафиксировать его viewport и основные координаты;
3. извлечь сетку, размеры, цвета, типографику и состояния;
4. реализовать экран внутри общего shell;
5. сделать скриншот реализации в том же viewport;
6. наложить его на референс с прозрачностью 50%;
7. устранить визуальные расхождения;
8. только после этого переходить к следующему экрану.

Запрещено реализовывать экраны «по памяти» или «по мотивам».

---

## 4. Визуальное направление

### Характер

- premium AI workspace;
- глубокий blue-charcoal вместо чистого чёрного;
- тёплый champagne-gold как основной акцент;
- electric cyan как вторичный функциональный акцент;
- спокойная технологичность без cyberpunk;
- тонкие границы и контролируемая глубина;
- открытые композиции и ясная визуальная иерархия;
- низкая визуальная плотность в hero-зонах;
- высокая информационная ясность в рабочих панелях.

### Базовая палитра

```css
:root {
  --bg-root: #0a0f13;
  --bg-sidebar: #0c1216;
  --bg-surface: #11181d;
  --bg-surface-raised: #161e23;
  --bg-surface-hover: #1a2329;
  --bg-input: #12191e;

  --border-subtle: #263038;
  --border-default: #323d45;
  --border-strong: #45515a;

  --text-primary: #f3f5f6;
  --text-secondary: #a9b0b5;
  --text-muted: #727c83;
  --text-disabled: #4d565c;

  --gold-primary: #efb64d;
  --gold-hover: #ffc767;
  --gold-active: #dda33c;
  --gold-soft: rgba(239, 182, 77, 0.10);
  --gold-border: rgba(239, 182, 77, 0.62);
  --gold-glow: rgba(239, 182, 77, 0.18);

  --cyan-primary: #55d7e5;
  --cyan-hover: #76e5ef;
  --cyan-soft: rgba(85, 215, 229, 0.10);
  --cyan-border: rgba(85, 215, 229, 0.38);

  --success: #42cf8c;
  --danger: #ef6464;
  --warning: #efb64d;
}
```

### Правила цвета

- Gold: активный маршрут, primary CTA, выбранный элемент, центральное ядро.
- Cyan: ссылки, аналитика, вторичные действия, отдельные специализации агентов.
- Основной фон: холодный blue-charcoal, не чистый чёрный.
- Панели отличаются от фона на 3–7% яркости.
- Glow используется только для Lumenza Core и важных выбранных состояний.
- Цвет не должен быть единственным способом передачи состояния.

---

## 5. Типографика

Основной шрифт: `Inter` или `Geist Sans`. Во всём приложении используется одна основная гарнитура.

| Элемент | Размер | Вес | Дополнительно |
|---|---:|---:|---|
| Page title | 28–32px | 600 | tracking `-0.025em` |
| Workspace headline | 30–38px | 600 | короткий, до 2–3 строк |
| Section title | 16–18px | 600 | спокойный контраст |
| Card title | 14–16px | 600 | без лишнего uppercase |
| Body | 13–15px | 400 | открытый line-height |
| Secondary | 12–13px | 400 | muted color |
| Metadata | 11–12px | 400–500 | compact |
| Sidebar item | 15–16px | 450–500 | устойчивый ритм |
| Wordmark | 15–17px | 500–600 | uppercase, tracking `0.28em` |

Правила:

- не использовать чрезмерно жирный текст;
- не применять uppercase ко всем заголовкам;
- сохранять короткие строки hero-текста;
- не уменьшать подписи до нечитаемых размеров;
- проверять реальные переносы строк по референсам.

---

## 6. Единый WorkspaceShell

### Постоянные элементы

При смене рабочего маршрута не размонтируются:

- sidebar;
- глобальный фон;
- ambient background;
- account block;
- глобальное состояние интерфейса;
- route transition layer.

Меняется только content workspace.

### Desktop

- основной контрольный viewport: `1600 × 1000`;
- ширина полного sidebar: приблизительно `244px`;
- ширина collapsed sidebar: `68–72px`;
- высота shell: `100dvh`;
- body не прокручивается, если workspace имеет собственный scroll container;
- shell не меняет геометрию между маршрутами.

### Запрещено

- белый экран загрузки;
- чёрный route veil;
- fullscreen spinner;
- повторное появление sidebar;
- мигание другой темы;
- скачок ширины контента;
- отдельный layout для каждой рабочей страницы.

---

## 7. Боковое меню

Меню плоское, без визуального разделения на группы.

### Точный порядок

1. Chat
2. Agents
3. Knowledge
4. Studio
5. Automations
6. History
7. All Tools
8. Apps
9. Community

### Верхняя зона

- знак Lumenza;
- wordmark `LUMENZA`;
- кнопка collapse/expand.

### Нижняя зона

- пользовательский avatar или companion;
- username;
- текущий план;
- баланс кредитов;
- account menu.

Pricing не является пунктом основного меню. Billing и Pricing находятся внутри Account.

### Геометрия пункта

- высота: `46–48px`;
- radius: `11–13px`;
- icon: `19–21px`;
- horizontal padding: `14–16px`;
- gap icon/label: `13–15px`;
- vertical gap: `4px`.

### Active state

- translucent gold background;
- тонкая gold border;
- gold icon и label;
- слабый внутренний highlight;
- без сплошной ярко-оранжевой заливки.

### Hover state

- background fade: `140–180ms`;
- icon translateX: `2–3px`;
- icon rotation: максимум `1–2deg`;
- плавное усиление текста и border;
- без резкого scale.

### Collapsed state

- текстовые labels скрыты;
- icons центрированы;
- tooltip появляется через `350–450ms`;
- account block превращается в avatar;
- active state остаётся различимым.

---

## 8. Motion system

### Route transition

```text
Outgoing:
opacity 1 → 0
translateY 0 → 4px
duration 120–160ms

Incoming:
opacity 0 → 1
translateY 6px → 0
duration 180–240ms

easing: cubic-bezier(0.22, 1, 0.36, 1)
```

Sidebar и фон остаются неподвижными.

### Chat → Agents

Shared-element transition центрального Lumenza Core:

1. центральная звезда слегка сжимается;
2. орбитальные линии ускоряются;
3. core перемещается вверх;
4. кольца расширяются по горизонтали;
5. из орбитальных точек появляются agent nodes;
6. сцена превращается в Agents network без полноэкранного fade.

Продолжительность: `480–650ms`.

### Panels

- right inspector: `x 18px → 0`, opacity `0 → 1`;
- modal: scale `0.985 → 1`, opacity `0 → 1`;
- bottom composer: `y 16px → 0`;
- duration: `220–340ms`.

### Общие правила

- преимущественно transform и opacity;
- цель: 60fps;
- hover movement не больше 3px;
- hover scale не больше 1.01;
- обязательная поддержка `prefers-reduced-motion`.

---

## 9. Lumenza Core

Центральная анимация Chat должна повторять референс.

### Состав

- champagne-gold звезда;
- тёмное круглое ядро;
- несколько тонких орбит;
- sparse gold и cyan particles;
- четыре направляющие оси;
- небольшие glowing nodes;
- асимметричное движение;
- контролируемый glow.

### Idle animation

- core scale: `0.98 → 1.02`;
- halo opacity: `0.35 → 0.65`;
- кольца вращаются с разными скоростями;
- gold и cyan particles имеют разные траектории;
- nodes пульсируют раз в `2.8–4s`;
- полный цикл орбит: `8–18s`;
- фазы движения не синхронизированы полностью.

Анимация не должна отвлекать от composer.

---

## 10. Экран Chat

### Композиция

- общий sidebar;
- context controls в правой верхней части;
- центральный Lumenza Core;
- большой composer;
- disclaimer;
- capability category rail;
- четыре action cards;
- guided-tour link.

### Context controls

- Model;
- Workspace mode;
- Active task;
- status/account control.

### Composer

- высота приблизительно `116–132px`;
- subtle gold border;
- raised dark surface;
- большое поле ввода;
- нижняя строка: Model, Mode, Task, Knowledge;
- microphone и send справа;
- send — круглая primary-кнопка.

### Category rail

- Featured
- Data Analysis
- Research
- Writing
- Code
- AI Workflows
- Images
- Presentations
- Video
- Audio

### Action cards

1. Market Research Report
2. Content Strategy
3. Data Visualization
4. Pitch Deck Builder

Каждая карточка содержит icon, title, description, cyan action и стрелку.

### Функциональность

- реальные model/task selectors;
- реальный Knowledge attachment;
- dictation;
- streaming response;
- доступ к сохранённым чатам;
- отсутствие отдельного page reload.

---

## 11. Экран Agents

### Header

- title/subtitle слева;
- New Agent и utility controls справа.

### Hero visualization

Центральный agent hub и пять узлов:

1. Research Agent
2. Executive Agent
3. Content Agent
4. Data Analyst
5. Automation Agent

Центральный hub — gold. Специализации используют gold, cyan, teal и blue accents.

### Agent composer

- большой task input;
- Model selector;
- Mode selector;
- Agent selector;
- Domain selector;
- microphone;
- gold send button.

### Нижние блоки

- Popular Capabilities;
- Agent Scenarios;
- trust footer.

### Функциональность

- выбор агента и модели;
- создание custom agent;
- реальный запуск сценария;
- состояние прогресса;
- shared transition с Chat.

---

## 12. Экран Studio

Studio сохраняет глобальный sidebar и добавляет внутренний rail.

### Studio rail

- Default / Apps;
- Inspirations / Community;
- Choose a Mode;
- Image;
- Video;
- Audio;
- Edit;
- Upscale;
- Reference.

Mode cards используют реальные thumbnails. Выбранный mode получает gold border.

### Main canvas

- masonry inspiration gallery;
- разные aspect ratios;
- одинаковые gaps;
- без placeholder gradients в финальной версии.

### Bottom composer

- Add reference;
- Tool selector;
- Model selector;
- Settings;
- gold Create button.

### Settings modal

- model list слева;
- параметры генерации справа;
- aspect ratio;
- resolution;
- quality;
- variations;
- visibility;
- prompt enhancer;
- выбранная модель выделяется gold border.

Все панели открываются внутри Studio без route reload.

---

## 13. Экран Account / Profile

### Account rail

- Profile
- Billing
- Security
- Preferences
- API Keys
- Sessions
- Notifications

### Основные блоки

1. My Companion
2. Identity and Current Plan
3. Agent Context

### Companion

- large preview;
- companion name;
- selectable companion thumbnails;
- gold selected state и checkmark;
- Show in profile switch;
- custom upload;
- Replace;
- Remove.

Companion при включённом показе отображается в profile, account menu, community identity и sidebar account block.

### Agent Context

- Role;
- Industry;
- Location;
- Working on;
- tone;
- audience;
- interests;
- excluded topics;
- preferred formats.

---

## 14. Экран Knowledge

### Header

- title/subtitle;
- Import;
- Search;
- Filter;
- More actions.

### Import area

- knowledge search;
- drag-and-drop;
- Upload files;
- Add link;
- Paste text;
- Notion;
- Google Drive;
- Confluence.

### Sources

- category tabs;
- sorting;
- list/grid toggle;
- source table;
- selected source с gold outline.

### Right inspector

- source icon/name;
- metadata;
- Overview / Content / Activity / Related;
- summary;
- tags;
- details;
- usage references;
- Ask about this source.

### Bottom

- Recent Sources;
- Collections.

Пустое состояние допустимо для нового аккаунта, но populated state должно точно сохранять структуру table + inspector.

---

## 15. Экран All Tools

### Main area

- title/subtitle;
- search;
- category navigation;
- featured capability;
- 3-column catalog grid.

### Categories

- All
- Research
- Data & Analytics
- Writing
- Code
- Images
- Presentations
- Audio
- Documents
- Automation

### Featured

Market Research Report с orbital Lumenza visual, description, capability markers и Run Analysis.

### Tool catalog

1. Research & Insights
2. Data Analysis
3. Content Creation
4. Code Assistant
5. Image Generation
6. Presentation Builder
7. Audio Generation
8. Document Intelligence
9. Automation Builder

### Right inspector

- icon;
- title/status;
- description;
- capabilities;
- best for;
- outputs;
- integrations;
- recent runs;
- primary open button;
- favorite control.

Выбор карточки обновляет только inspector. URL category query должен открывать правильный фильтр.

---

## 16. Адаптивность

### Breakpoints

- `≥1280px`: полный sidebar и desktop composition;
- `1024–1279px`: уменьшенные gutters и inspectors;
- `768–1023px`: collapsed sidebar, secondary rails могут прокручиваться;
- `<768px`: sidebar drawer, inspectors превращаются в bottom sheets.

### Правила

- не складывать механически весь desktop UI в одну колонку;
- сохранять приоритеты и иерархию;
- Chat composer должен оставаться доступным;
- Studio dock не перекрывает важный контент;
- таблицы прокручиваются горизонтально;
- touch targets не меньше `40–44px`;
- mobile motion упрощается, но не исчезает полностью.

---

## 17. Функциональные требования

В новом UI нельзя подменять существующие возможности декорациями.

Обязательно сохранить и проверить:

- authentication;
- account/profile update;
- companion upload/select/show/remove;
- chat history;
- создание и открытие тредов;
- streaming chat response;
- model/task routing;
- presets;
- knowledge workspaces;
- text/image/file imports;
- semantic search;
- Studio modes;
- image/audio/edit operations;
- agent selection and runs;
- tools category deep links;
- automations/history;
- plan, credits и billing links.

Любой control должен:

- выполнять действие;
- быть disabled с объяснением;
- или честно иметь статус Preview.

---

## 18. Этапы реализации

### Phase 0 — Baseline

- [ ] Зафиксировать шесть reference images.
- [ ] Записать точные viewport каждого референса.
- [ ] Снять скриншоты текущей реализации.
- [ ] Определить функциональные контракты, которые нельзя сломать.
- [ ] Подготовить визуальные regression tests.

### Phase 1 — Design tokens

- [ ] Удалить зависимость нового UI от старой orange palette.
- [ ] Ввести новые semantic color tokens.
- [ ] Зафиксировать typography scale.
- [ ] Зафиксировать spacing, radius, borders и shadows.
- [ ] Создать motion tokens.
- [ ] Добавить reduced-motion вариант.

### Phase 2 — Unified shell

- [ ] Собрать постоянный WorkspaceShell.
- [ ] Реализовать единый sidebar.
- [ ] Реализовать collapsed state.
- [ ] Реализовать account block.
- [ ] Удалить route-specific sidebar variants.
- [ ] Удалить fullscreen loading veil.
- [ ] Добавить content crossfade.

### Phase 3 — Chat and Agents

- [ ] Собрать Chat по референсу.
- [ ] Реализовать Lumenza Core.
- [ ] Подключить реальный composer.
- [ ] Собрать categories/action cards.
- [ ] Собрать Agents orbit scene.
- [ ] Подключить реальный agent composer.
- [ ] Реализовать Chat → Agents shared transition.
- [ ] Выполнить screenshot overlay comparison.

### Phase 4 — Studio

- [ ] Собрать внутренний Studio rail.
- [ ] Собрать inspiration masonry.
- [ ] Собрать persistent bottom dock.
- [ ] Собрать settings modal.
- [ ] Подключить реальные Image/Audio/Edit flows.
- [ ] Отметить неподключённые providers как Preview.
- [ ] Выполнить screenshot overlay comparison.

### Phase 5 — Account

- [ ] Собрать account rail.
- [ ] Собрать companion picker.
- [ ] Подключить upload/select/show/remove.
- [ ] Собрать identity/current plan.
- [ ] Собрать Agent Context.
- [ ] Проверить companion во всех surfaces.
- [ ] Выполнить screenshot overlay comparison.

### Phase 6 — Knowledge

- [ ] Собрать import/search area.
- [ ] Собрать source filters/table.
- [ ] Собрать right inspector.
- [ ] Собрать Recent Sources и Collections.
- [ ] Подключить реальные imports/search.
- [ ] Проверить empty/populated/loading/error states.
- [ ] Выполнить screenshot overlay comparison.

### Phase 7 — All Tools

- [ ] Собрать search/categories.
- [ ] Собрать featured capability.
- [ ] Собрать 3-column catalog.
- [ ] Собрать right inspector.
- [ ] Подключить category query parameters.
- [ ] Проверить все routes и Preview states.
- [ ] Выполнить screenshot overlay comparison.

### Phase 8 — Secondary routes

- [ ] Привести Automations к новой системе.
- [ ] Привести History к новой системе.
- [ ] Привести Apps и Community к новой системе.
- [ ] Привести Billing/Pricing/Usage к новой системе.
- [ ] Убедиться, что secondary routes не выглядят как старое приложение.

### Phase 9 — Verification

- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Critical E2E flows.
- [ ] TypeScript.
- [ ] ESLint.
- [ ] Production build.
- [ ] Keyboard navigation.
- [ ] Contrast and accessibility.
- [ ] Reduced motion.
- [ ] Desktop screenshot comparison.
- [ ] Tablet/mobile verification.

---

## 19. Pixel-perfect verification

Для каждого route:

1. использовать viewport референса;
2. дождаться завершения загрузки и анимации входа;
3. сделать screenshot;
4. наложить screenshot на reference с opacity 50%;
5. проверить major anchors;
6. исправить drift;
7. повторять до достижения допуска.

### Допуск

- major layout positions: `±2px`;
- internal spacing: `±4px`;
- control height: `±2px`;
- radius: `±2px`;
- font size: `±1px`;
- icon alignment: `±2px`;
- inspector/sidebar width: `±2px`.

### Проверяемые anchors

- sidebar edges;
- page header baseline;
- hero/core center;
- composer bounds;
- category rail;
- first/last grid card;
- inspector edge;
- bottom dock;
- account block;
- modal bounds.

---

## 20. Definition of Done

Редизайн считается завершённым только если:

- [ ] все шесть основных маршрутов визуально соответствуют референсам;
- [ ] старый чёрно-оранжевый дизайн отсутствует;
- [ ] sidebar одинаков на всех рабочих маршрутах;
- [ ] страницы ощущаются одним приложением;
- [ ] нет fullscreen route reload;
- [ ] Chat и Agents используют shared Lumenza transition;
- [ ] Studio использует внутренний левый rail;
- [ ] Account поддерживает companion end-to-end;
- [ ] Knowledge имеет рабочие import/search/filter/inspector states;
- [ ] All Tools поддерживает фильтры и inspector без reload;
- [ ] все видимые controls функциональны или честно помечены Preview;
- [ ] desktop screenshot diff находится в заданном допуске;
- [ ] tablet/mobile layouts проверены;
- [ ] tests, lint, typecheck и production build проходят;
- [ ] accessibility и reduced-motion не сломаны.

---

## 21. Порядок приоритетов при конфликте

Если требования конфликтуют, использовать следующий порядок:

1. Утверждённый reference image.
2. Единая визуальная система этого документа.
3. Рабочий пользовательский сценарий.
4. Accessibility.
5. Responsive behavior.
6. Удобство реализации.

Нельзя упрощать характерные части референса только ради более простой реализации.

---

## 22. Ключевая инструкция исполнителю

```text
Не создавай дизайн «в стиле» приложенных изображений.
Перенеси сами изображения в интерфейс максимально буквально.

Сохраняй существующую бизнес-логику, но полностью замени визуальный слой.
Не используй старый чёрно-оранжевый дизайн.
Не меняй структуру sidebar между маршрутами.
Не создавай отдельные загружающиеся страницы.

После каждого экрана делай screenshot comparison.
Если результат отличается от референса, исправляй его до перехода к следующему этапу.
```

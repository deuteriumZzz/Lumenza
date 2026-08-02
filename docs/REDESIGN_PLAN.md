# Lumenza redesign — рабочий план (2026-08-02)

Контекст: пользователь прислал 27 скриншотов-референсов (1-5 Abacus.ai,
6-21 ImagineArt, 22-27 — целевые мокапы самой Lumenza: All Tools, Knowledge,
Account, Studio, Agents, Chat). Разведка показала, что предыдущий редизайн
("revised implementation order", см. память `project_redesign_initiative`)
уже реализовал большую часть целевой структуры: разделённые секции
Chat/Agents/Knowledge/Studio, вкладки Studio Image/Video/Audio/Edit/Upscale
с ModeLibrary-сетками, пикер модели/инструмента/настроек, hover-анимации
сайдбара (`sidebar-navigation-icon` уже двигается при hover — п.
"анимация как в студии" уже выполнен), общие layoutId между Chat/Agents.

Цвета/расположение не трогаем без необходимости (amber/oklch primary уже
соответствует референсам). Chat и Agents остаются архитектурно раздельными
— никаких смешанных "агент+чат" в одном потоке.

## Статус по пунктам запроса

| # | Что просили | Статус | Файлы |
|---|---|---|---|
| 1 | Chat как на Abacus (модель/режим в чате, тег выбранной темы) | Частично есть (ModelPicker/PresetPicker/task chips/category tabs), нет чат-версии `AgentModeMenu` и pill-тега выбранной категории | `chat-thread-view.tsx` |
| 2 | Chat и Agents — раздельные, переключение сбоку | Уже сделано | `workspace-sections.ts`, `thread-sidebar.tsx` |
| 3 | Hover-анимация сайдбара как в Studio | Уже сделано (`.sidebar-navigation-icon:hover`) | `globals.css:1418-1427` |
| 4 | Бесшовная анимация Chat→Agents (подъём в центр) | Частично есть (`WorkspaceModeMorph`, общий `layoutId`), нужно усилить "lift" | `route-transition.tsx` |
| 5 | Studio: Image/Video/Audio/Edit/Upscale | Уже сделано, но Edit не имеет ModeLibrary-сетки (Inpaint/Outpaint/Camera Angles/Relight/Magic Text), в отличие от Video/Audio/Upscale | `studio/page.tsx` |
| 6 | Sidebar: Apps/All Tools/Community | Уже сделано | `thread-sidebar.tsx:69-79` |
| 7 | Убрать лишнее/дубли из сайдбара | Не сделано — Studio/All Tools/Apps flyout дублируют один и тот же список режимов | `thread-sidebar.tsx` |
| 8 | Питомец — анимированный, с выбором/отключением пресетов | Не сделано (сейчас статичная картинка) | `models.py`, `serializers.py`, `views.py`, `profile/page.tsx`, `account-menu.tsx` |
| 9 | Account/Studio/Agents/Chat/Knowledge/All Tools — как на мокапах 22-27 | В основном уже соответствует; точечные пробелы ниже | — |

## Точечные пробелы — статус на конец фазы 2 (2026-08-02)

1. ✅ **Питомец-компаньон**: `pet_preset` (fox/cat/robot/dragon/rabbit/blob)
   на бэкенде (`accounts/models.py`, миграция `0006_user_pet_preset`,
   `UserPetSerializer` с взаимоисключением image/preset), общий компонент
   `components/pet-avatar.tsx` (idle-анимация всегда, усиленная "activity"
   анимация + пульсирующее кольцо, когда `usePetActivity()` = true),
   галерея пресетов на `/profile`, активность привязана к статусу
   `AgentRun` в `/agents/[slug]` через `lib/pet-activity.tsx`
   (`PetActivityProvider` в `app/layout.tsx`).
2. ✅ **Sidebar declutter**: Studio/All Tools/Apps flyout в
   `thread-sidebar.tsx` теперь показывают три РАЗНЫХ набора ссылок (режимы
   Studio · категории каталога инструментов · реальные Apps-сценарии).
3. ✅ **Knowledge**: блоки "Недавние источники" и "Коллекции" добавлены в
   `WorkspaceDetail` (knowledge/page.tsx) под таблицей источников.
4. ✅ **All Tools** (`all-tools-catalog.tsx`): при ревью оказалось, что
   Featured-карточка и правая детальная панель (категория/статус/описание/
   workspace/CTA) уже существовали — структура уже соответствует мокапу 22,
   доработка не требовалась.
5. ✅ **Chat**: добавлен `ChatModeMenu` в `chat-thread-view.tsx` (зеркало
   `AgentModeMenu` из `agents/page.tsx`, с "Chat" как текущим пунктом).
   Pill выбранной категории отдельно не добавлялся — существующий
   `routing.kind === "task"` пилюля на кнопке "Режим" уже закрывает этот
   сценарий.
6. ✅ **Route transition**: `WorkspaceModeMorph` в `route-transition.tsx`
   теперь анимирует `y` от +46 до -14 (подъём к центру и лёгкий перелёт),
   а не только opacity/scale.
7. ✅ **Studio Edit mode**: добавлен `EditWorkspace` с `ModeLibrary`-сеткой
   (Inpaint/Outpaint/Camera angles/Relight/Magic text) — паритет с
   Video/Audio/Upscale достигнут.

## Известное ограничение выполнения

В песочнице этой сессии отсутствуют Node.js и рабочее окружение Python
backend (нет venv/системного Python нужной версии) — автотесты
(`npm test`, `pytest`) не запускались. Код прочитан построчно, все правки
синтаксически проверены (`ast.parse` для Python, ручной baланс скобок для
TS/TSX), обновлённые/добавленные тесты (`account-menu.test.tsx`,
`profile/page.test.tsx`, `test_accounts.py`) описаны в коммите — **нужно
прогнать `npm test` и `pytest` до мержа**, а также
`python manage.py makemigrations --check` для проверки миграции 0006.

## Явно отложено (по просьбе пользователя)

Пользователь сам сказал: "редизайн сначала, функции/модели подключим потом".
Video/Upscale generation остаются UI-заглушками (провайдер не подключён) —
это не трогаем в этом проходе.

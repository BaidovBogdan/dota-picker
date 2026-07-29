# Counterpick landing: technical audit V2

Дата: 27 июля 2026
Выбранный знак: `10 — Draft Timer`
Целевая палитра: чёрный, тёплый белый, красный; дополнительные цвета не нужны

## 1. Итоговое техническое решение

Текущий лендинг не стоит постепенно рестайлить. Его нужно сохранить как источник проверенных продуктовых фактов, но полностью заменить композиционный и клиентский слой.

Рекомендуемая целевая архитектура:

- Astro остаётся статическим генератором;
- основной HTML становится нативным Astro, без гидратации всей страницы через React;
- GSAP и ScrollTrigger управляют тремя-четырьмя общими сценами через один orchestration-модуль;
- icon-10 пересобирается в точный repo-native SVG с отдельными сегментами;
- один опциональный Three.js canvas остаётся только как desktop-enhancement для фирменного `Decision Current`;
- мобильная версия получает самостоятельную короткую motion-сцену, а не статическую копию desktop;
- reduced-motion версия сразу показывает понятные конечные состояния;
- будущая реальная запись матча встраивается заменой media-layer одной сцены, без перестройки страницы.

Ключевой принцип: один и тот же segmented timer проходит через весь лендинг и меняет смысл:

`много кандидатов → таймер сжимается → остаются три красных решения → выбранный вариант → установка`.

## 2. Проверенный baseline

### Стек

| Часть | Текущее состояние |
|---|---|
| Framework | Astro `7.1.3`, static output |
| UI runtime | React `19.2.8`, вся страница как один `client:load` island |
| Motion | GSAP `3.15.0`, ScrollTrigger, `@gsap/react` |
| 3D | Three.js `0.185.1`, динамический import |
| Styling | Tailwind `4.3.3` подключён, но основная система написана вручную в одном CSS-файле |
| Icons | `lucide-react` |
| TypeScript | strict Astro config |

### Размер исходников

| Файл | Размер |
|---|---:|
| `LandingPage.tsx` | 954 строки, 29.9 KB |
| `global.css` | 3576 строк, 64.8 KB |
| `DraftCore.tsx` | 346 строк, 11.3 KB |
| `HeroDemo.tsx` | 262 строки, 7.4 KB |
| `ScenarioConsole.tsx` | 157 строк, 4.9 KB |

Страница уже превратилась в монолит: контент, pricing, release-state, GSAP orchestration и почти вся визуальная структура связаны внутри одного React-компонента.

### Production build

Команда:

```text
npm run build
```

Результат:

- Astro check: 10 файлов, 0 errors, 0 warnings, 0 hints;
- static build: 1 страница;
- полная сборка: около 1.03 секунды.

### Текущие bundle-размеры

| Chunk | Raw | Gzip | Загрузка |
|---|---:|---:|---|
| Astro React client | 179.8 KiB | 56.0 KiB | initial |
| LandingPage | 152.9 KiB | 54.9 KiB | initial |
| React helper | 7.4 KiB | 2.8 KiB | initial |
| CSS | 56.1 KiB | 12.5 KiB | initial |
| Three.js | 707.5 KiB | 178.3 KiB | deferred |

Начальный JS до Three.js составляет примерно `113.7 KiB gzip`. Это пока допустимо, но почти весь объём нужен только потому, что статический маркетинговый контент гидратируется как React-приложение.

### Текущие ассеты

- два Satoshi WOFF2: около `50 KiB` суммарно;
- Dota hero images: локальные WebP и маленькие PNG, большинство файлов `2–8 KiB`;
- источники Valve CDN и Fontshare зафиксированы в `public/SOURCES.md`;
- текущие `favicon.svg`, `og.svg`, `og.png` используют старый acid/ember brand mark и должны быть заменены.

### Icon-10

Текущий файл `design-exploration/icons/icon-10.png`:

- `1024 × 1024`;
- `86,769 bytes`;
- 24-bit RGB;
- без alpha-канала;
- содержит тёплый белый фон;
- базовая палитра: `#F12218`, `#101217`, `#F9F6F0`.

PNG годится как визуальный референс и основа для social/app export, но не как основной знак в интерфейсе. Для точной анимации и масштабирования нужен нативный SVG.

## 3. Что сохранить

### Сохранить без изменения смысла

- `output: "static"` в Astro;
- strict TypeScript;
- проверку `PUBLIC_DOWNLOAD_URL` и `PUBLIC_BETA_URL`;
- приоритет download URL над beta URL;
- честное pending-состояние, когда ссылки ещё нет;
- verified product facts из `marketing-data.ts`;
- FAQ на нативных `<details>` и `<summary>`;
- skip-link, focus-visible и базовую семантику;
- legal disclaimer про Valve;
- `public/SOURCES.md`;
- оптимизированные Valve portraits, если они подходят новой сцене;
- `document.visibilityState`, `IntersectionObserver`, `ResizeObserver`, DPR cap, context-loss fallback и dispose-паттерны из `DraftCore.tsx`.

### Сохранить только как техническую идею

- динамический import Three.js;
- SVG/DOM fallback до готовности WebGL;
- `gsap.matchMedia()`;
- scoping анимаций;
- desktop pinning и mobile natural flow как разные режимы;
- refresh ScrollTrigger после загрузки шрифтов.

### Сохранить только контент, но не текущую форму

- три рекомендации;
- пять scoring signals;
- Free и Pro quota;
- логика `Detected → Ranked → Explained`;
- hero portraits;
- install/download CTA;
- FAQ-ответы.

## 4. Что удалить или полностью заменить

### Удалить как визуальную архитектуру

- старый CSS `BrandMark`;
- acid/ember palette;
- декоративный icosahedron;
- trust band;
- telemetry marquee;
- proof bento;
- текущую card pricing;
- дублирующиеся product demos;
- `ScenarioConsole` в виде dashboard/console;
- framed UI вокруг всего, кроме реального overlay;
- повторяющиеся uppercase micro-labels;
- сетки, угловые рамки и HUD-декор, которые не объясняют продукт;
- outline-вторую строку hero;
- отдельные несвязанные reveal-анимации.

### Заменить на уровне кода

- `LandingPage.tsx` → статическая композиция `LandingPage.astro`;
- `HeroDemo.tsx` → `OverlayStage.astro` и небольшой DOM-controller;
- `DraftCore.tsx` → `DecisionField.astro` + отдельный lifecycle-модуль;
- `ScenarioConsole.tsx` → одна органическая decision scene без tabs/dashboard;
- `global.css` → токены, база, layout и motion в отдельных слоях;
- `lucide-react` → несколько точных inline SVG либо собственный SVG sprite;
- `client:load` на корне → bundled Astro script с GSAP orchestration.

После миграции React не нужен текущему лендингу:

- FAQ уже работает без JS;
- CTA статические;
- replay и переключение состояния можно реализовать через небольшой DOM-controller;
- GSAP сам управляет timeline state.

После подтверждения отсутствия React islands можно удалить:

- `@astrojs/react`;
- `@gsap/react`;
- `react`;
- `react-dom`;
- `lucide-react`;
- соответствующие `@types`.

Tailwind можно оставить как compile-time инструмент только при реальном использовании utilities. Если новая композиция снова почти полностью использует semantic CSS, `@tailwindcss/vite` и `tailwindcss` лучше удалить после визуального QA.

## 5. Целевая структура файлов

```text
src/
  components/
    brand/
      CounterpickMark.astro
    landing/
      LandingPage.astro
      Navigation.astro
      Hero.astro
      DecisionStory.astro
      OverlayStage.astro
      EvidenceFlow.astro
      Pricing.astro
      Faq.astro
      FinalAction.astro
      Footer.astro
  data/
    landing-content.ts
  motion/
    init-landing-motion.ts
    create-hero-timeline.ts
    create-decision-timeline.ts
    create-conversion-timeline.ts
    motion-preferences.ts
  visuals/
    decision-field.ts
  layouts/
    BaseLayout.astro
  pages/
    index.astro
  styles/
    tokens.css
    base.css
    landing.css
    motion.css
public/
  brand/
    counterpick-mark.svg
    counterpick-mark-512.png
    counterpick-mark-1024.png
    favicon.svg
    og.png
```

`CounterpickMark.astro` нужен для inline-анимации. `public/brand/counterpick-mark.svg` нужен для внешнего использования, mask и metadata. Геометрия у них должна происходить из одного source of truth, а не рисоваться дважды вручную.

## 6. Интеграция icon-10

### Нативный SVG

SVG должен быть пересобран вручную как чистая геометрия, а не автоматически трассирован в сотни точек.

Структура:

- одна группа чёрных timer-сегментов;
- три отдельных красных result-wedges;
- прозрачный фон;
- центрированная оптическая область;
- стабильный `viewBox`, например `0 0 256 256`;
- каждый сегмент имеет стабильный `data-segment`;
- красные wedges имеют `data-result="1|2|3"`.

Такой SVG позволяет:

- собирать знак по сегментам в hero;
- сжимать чёрный candidate pool;
- отделять три красных решения;
- превращать выбранный wedge в линию Decision Current;
- в финале снова собирать знак;
- использовать один mark на тёмном и светлом фоне через CSS variables.

### Что не делать

- не использовать CSS `conic-gradient` как единственную версию знака;
- не анимировать PNG;
- не помещать PNG с белым квадратным фоном в nav;
- не использовать MorphSVG/DrawSVG premium plugins;
- не делать mark зависимым от canvas;
- не использовать разные формы в favicon, nav и финальном CTA без оптической причины.

### Оптические тесты

Перед интеграцией проверить:

- 16 px;
- 20 px;
- 24 px;
- 32 px;
- 48 px;
- 64 px;
- 128 px;
- 512 px;
- 1024 px;
- одноцветный чёрный вариант;
- одноцветный белый вариант;
- красно-чёрный на `#F9F6F0`;
- бело-красный на `#101217`.

Для favicon допустима отдельная simplified-версия: самые маленькие чёрные wedges можно объединить, если они исчезают на 16 px. Это оптическая коррекция, а не новый логотип.

## 7. Цветовая система

Основные токены:

| Роль | Значение |
|---|---|
| Ink | `#101217` |
| Paper | `#F9F6F0` |
| Signal red | `#F12218` |
| Deep red | `#B91510` |
| Muted ink | `#686660` |
| Light hairline | `rgba(16, 18, 23, 0.16)` |
| Dark hairline | `rgba(249, 246, 240, 0.18)` |

`Deep red` не является четвёртым акцентом: это та же красная шкала для hover, depth и доступного контраста.

Правила:

- никакого acid green, cyan, purple или gaming blue;
- нейтральные серые допустимы как альфа от ink/paper;
- red обозначает решение, urgency и действие, а не заполняет каждый экран;
- переходы между paper и ink делаются через одну и ту же форму Decision Current, а не резкими независимыми секциями;
- hero portraits можно слегка десатурировать; lead pick получает естественный цвет или красный emphasis;
- full-screen blur и тяжёлые backdrop filters не использовать.

## 8. Motion architecture

До production UI-кода новый implementation-pass обязан выпустить отдельный `<design_plan>` по правилам `gpt-taste`, включая новый deterministic RNG для выбранного icon-10. Этот аудит не заменяет pre-flight.

### Общая модель

Не создавать timeline на каждый компонент. Нужны три master timelines и один небольшой interaction timeline:

1. `heroTimeline`
   - mark собирается;
   - timer начинает движение;
   - headline раскрывается широкими masks;
   - три красных wedges отделяются;
   - overlay уже виден в первом viewport.

2. `decisionTimeline`
   - desktop pinned chapter;
   - enemy picks входят в поле;
   - чёрные сегменты реагируют на каждый lock;
   - candidate pool расширяется;
   - сегменты схлопываются до трёх;
   - три wedges становятся recommendations;
   - lead wedge раскрывает reason и risk.

3. `conversionTimeline`
   - current проходит через прозрачное сравнение Free/Pro;
   - Pro получает emphasis без card-glow;
   - final CTA собирает icon-10 обратно;
   - download action становится логическим завершением, а не отдельным баннером.

4. `overlayReplayTimeline`
   - запускается только пользовательской кнопкой;
   - не создаёт новый ScrollTrigger;
   - сбрасывает локальные states без влияния на scroll position.

### GSAP implementation rules

- один `gsap.context()` на страницу;
- `gsap.matchMedia()` для desktop, tablet, mobile и reduced-motion;
- selectors только через `data-motion` и локальный scope;
- ScrollTrigger создаётся в одном orchestration-модуле;
- `pin` только для одного главного decision chapter;
- максимум три-четыре master timelines;
- scroll distance зависит от viewport и количества фаз, а не от жёсткого `+=2300`;
- анимировать `transform`, `opacity`, `clip-path`, SVG stroke/segment transforms;
- не анимировать layout properties во время scroll;
- `will-change` добавлять только активным элементам и снимать после timeline;
- не добавлять smooth-scroll library;
- не добавлять preloader, custom cursor, обязательный звук или бесконечную декоративную карусель;
- все timelines уничтожаются через context revert;
- `ScrollTrigger.refresh()` после fonts ready, breakpoint change и изменения ориентации.

### Motion continuity

Каждая глава должна получить входной и выходной state одного объекта:

| Фаза | Вход | Выход |
|---|---|---|
| Hero | разрозненные timer segments | собранный icon-10 |
| Detection | собранный timer | деформированный candidate ring |
| Ranking | много чёрных segments | три красных wedges |
| Explanation | три wedges | один lead wedge + две alternatives |
| Pricing | lead path | разделение Free/Pro |
| Final action | две plan-линии | снова собранный icon-10 |

Если section нельзя связать с этим handoff, section нужно удалить, а не украшать отдельной анимацией.

## 9. Один WebGL canvas

### Вердикт

Один canvas оправдан как signature enhancement для desktop, потому что пользователь просит максимальный WOW. Но он должен визуализировать продуктовую механику, а не быть декоративным 3D-объектом.

Текущий icosahedron удалить. Новый `DecisionField` должен показывать annular flow, который:

- начинается геометрией icon-10;
- реагирует на enemy locks;
- расширяется в candidate field;
- притягивается к трём result wedges;
- отдаёт одну красную траекторию следующей главе.

### Технические ограничения

- один `WebGLRenderer`;
- один canvas;
- один scene;
- один camera;
- один instanced geometry или один lightweight shader field;
- без postprocessing;
- без shadow maps;
- без texture atlas, если достаточно procedural geometry;
- ориентир: 60–120 instanced segments/particles;
- один-два draw calls;
- DPR максимум `1.5`, автоматическое падение до `1.0`;
- dynamic import Three.js;
- SVG fallback виден до `compileAsync`;
- canvas декоративный и `aria-hidden`;
- `pointer-events: none`;
- инициализация только при `no-preference`, fine pointer, WebGL support и выключенном Save-Data;
- pause при hidden document и вне storytelling range;
- context lost возвращает SVG fallback;
- dispose всех geometry, material, observer и ticker callbacks.

### Управление сценой

GSAP не должен напрямую перестраивать десятки объектов каждый scroll tick. Предпочтительнее:

- заранее вычислить start/end positions;
- передавать один нормализованный `progress`;
- интерполировать состояние в shader либо в одном render callback;
- subtle idle motion отделить от semantic scroll progress;
- при отсутствии scroll/idle motion не рендерить лишние кадры.

### Performance gate

Canvas допускается в финальную версию только если:

- SVG/DOM fallback уже самодостаточен;
- deferred Three chunk не входит в критический путь LCP;
- средний frame time остаётся ниже 16.7 ms на целевом desktop;
- после 120 samples при среднем выше 20 ms включается downgrade;
- на mobile и reduced-motion он не загружается.

Текущий Three chunk равен `178.3 KiB gzip`; это верхняя граница, а не приглашение добавлять дополнительные WebGL-зависимости.

## 10. Mobile и reduced motion

### Mobile

Текущий breakpoint фактически превращает главный pinned story в длинную статическую страницу. Новый mobile flow должен быть другим, но всё ещё живым:

- без длинного pinning;
- короткий hero assembly;
- три последовательных states в natural document flow;
- icon-10 остаётся sticky только на коротком участке либо переходит между блоками через FLIP-подобный transform;
- не более одного активного scroll scrub одновременно;
- изображения не масштабируются выше необходимого raster-size;
- touch targets минимум 44 px;
- CTA остаётся виден и понятен на 320 px;
- overlay не должен превращаться в узкую desktop-карточку;
- mobile state завершает историю тем же собранным знаком.

Breakpoints для QA:

- 320;
- 360;
- 390;
- 430;
- 768;
- 1024;
- 1440;
- 1920 px.

### Reduced motion

Reduced-motion должен быть отдельным понятным narrative state:

- не инициализировать canvas;
- не создавать pin/scrub ScrollTriggers;
- не запускать marquee;
- не скрывать контент в начальных GSAP states;
- показывать final recommendation state сразу;
- оставить мгновенную или минимальную смену состояний по кнопке;
- выключить smooth scroll;
- mark остаётся статичным, но смысл `many → three` читается в композиции.

CSS должен гарантировать видимость контента даже если JS не загрузился или timeline упал.

## 11. Будущая реальная запись Dota

Сейчас не добавлять:

- `<video>`;
- загрузку media asset;
- scrub по `currentTime`;
- timecode config;
- fake player controls;
- placeholder с обещанием видео;
- автозвук;
- временную mock-логику.

Но текущий redesign нужно собрать с правильным seam.

### Рекомендуемый seam

Главная product scene должна иметь три независимых слоя:

```text
experience-stage
  media-layer
  overlay-layer
  narrative-layer
```

Сейчас `media-layer` содержит абстрактную draft-сцену на DOM/SVG. Позже он заменяется реальным матч-видео. `overlay-layer` остаётся отдельным DOM-слоем и визуально появляется поверх записи.

Это лучше, чем полностью вжигать overlay в видео:

- текст остаётся резким на любом DPR;
- overlay адаптируется под mobile crop;
- можно менять героя, reason и pricing-copy без рендера нового видео;
- время появления overlay задаётся независимо;
- доступность и performance управляются отдельно.

### Контракт для будущей замены

Motion orchestration должен обращаться не к тегу видео, а к нейтральным data states:

- `data-scene="queue"`;
- `data-scene="accepted"`;
- `data-scene="draft"`;
- `data-scene="overlay"`;
- `data-scene="pick"`.

В текущей версии эти states управляют DOM-сценой. В будущей версии они будут синхронизированы с timecodes отредактированного ролика.

Рекомендуемая будущая глава: Desire, после того как hero уже объяснил promise. Видео не должно становиться LCP и не должно загружаться до приближения к сцене.

## 12. Performance budgets V2

| Метрика | Target |
|---|---:|
| Initial JS без WebGL | `≤ 65 KiB gzip` |
| Deferred Three.js | `≤ 180 KiB gzip` |
| CSS | `≤ 30–35 KiB gzip` |
| Fonts | `≤ 60 KiB total` |
| First-view transfer до WebGL | `≤ 400 KiB` |
| LCP | `≤ 2.5 s` |
| INP | `≤ 200 ms` |
| CLS | `≤ 0.05` |
| Long task | `< 50 ms` |
| Desktop frame budget | `16.7 ms` |

Снижение initial JS до `≤ 65 KiB gzip` реалистично после удаления React runtime и корневого `client:load`.

Дополнительные правила:

- hero mark inline SVG, не blocking image;
- только один font weight preload;
- below-fold portraits `loading="lazy"` и корректные width/height;
- не использовать giant background video или uncompressed texture;
- CSS grain только маленьким повторяемым asset либо лёгким gradient, не full-resolution PNG;
- content-visibility применять только к неприкреплённым поздним главам;
- не применять `content-visibility` к pinned chapter;
- не оставлять `will-change` на всей странице.

## 13. BaseLayout и metadata

Сохранить:

- `lang="en"`;
- viewport;
- description;
- Open Graph;
- Twitter card;
- font preload;
- static title.

Изменить:

- `theme-color` на новый ink или динамически под основной фон;
- `color-scheme` не фиксировать только как dark, если большая часть страницы paper;
- заменить favicon;
- заменить OG image;
- добавить canonical URL, когда будет известен production domain;
- добавить Windows/software structured data только после появления проверенных installer URL, версии и системных требований.

Не придумывать:

- fixed launch date;
- accuracy;
- FPS impact;
- VAC status;
- installer size;
- user count;
- review score;
- MMR gain.

## 14. План миграции

### P0. Brand foundation

1. Пересобрать icon-10 в SVG.
2. Проверить 16–1024 px.
3. Зафиксировать palette tokens.
4. Заменить favicon и OG composition.
5. Зафиксировать motion states знака.

Acceptance:

- mark читается без wordmark;
- нет белого PNG-квадрата;
- mark одинаково узнаваем на paper и ink;
- три красных решения читаются на 24 px.

### P1. Static Astro skeleton

1. Вынести verified content.
2. Собрать четыре AIDA-главы.
3. Удалить dashboard/card composition.
4. Оставить один настоящий overlay frame.
5. Сделать страницу полной и понятной без JS.

Acceptance:

- promise и install action ясны в первом viewport;
- нет пустых bento cells;
- нет duplicate demos;
- без JS видны pricing, FAQ и final CTA.

### P2. GSAP continuity

1. Реализовать icon assembly.
2. Реализовать один pinned decision chapter.
3. Передать current в pricing.
4. Собрать icon в final CTA.
5. Добавить отдельные mobile/reduced branches.

Acceptance:

- каждый новый state продолжает предыдущий;
- нет скачка при pin/unpin;
- deep-link и reload в середине страницы не ломают layout;
- resize/orientation корректно пересоздают triggers.

### P3. Semantic WebGL

1. Перенести lifecycle safeguards.
2. Заменить icosahedron на annular decision field.
3. Связать progress с GSAP.
4. Проверить SVG fallback.
5. Провести frame/memory profiling.

Acceptance:

- canvas усиливает `many → three`;
- без canvas сайт не выглядит незавершённым;
- mobile и reduced-motion не загружают Three.js;
- context loss не оставляет пустую дыру.

### P4. Conversion and QA

1. Проверить все release URL states.
2. Проверить keyboard/focus/FAQ.
3. Проверить breakpoints.
4. Снять Lighthouse и Performance traces.
5. Проверить bundle budgets.
6. Проверить copy на отсутствие недоказанных claims.

Acceptance:

- build проходит без warnings;
- нет horizontal overflow;
- CTA работает во всех env states;
- Web Vitals остаются в target;
- визуальная история сохраняется при reduced motion.

## 15. Обязательные проверки

### Functional

- пустые env;
- только beta URL;
- только download URL;
- обе ссылки;
- относительный URL;
- `http` и `https`;
- отклонение `javascript:`, `data:` и protocol-relative URL;
- keyboard replay;
- FAQ с клавиатуры;
- anchor navigation;
- reload внутри pinned range.

### Visual

- light и dark chapter transitions;
- icon at 16/24/32/64 px;
- 320–1920 px;
- touch/coarse pointer;
- zoom 200%;
- long English strings;
- no horizontal scrollbar;
- overlay читается поверх portraits;
- red не используется как единственный носитель смысла.

### Motion

- desktop 60 fps target;
- CPU throttling;
- tab hidden/visible;
- scroll reversal;
- rapid resize;
- orientation change;
- reduced motion до page load;
- reduced motion после OS preference change;
- WebGL context loss;
- Save-Data.

### Build

- `npm run check`;
- `npm run build`;
- gzip size report;
- duplicate package audit;
- unused dependency audit;
- image dimensions and lazy-loading audit.

## 16. Риски

### Icon выглядит как progress chart

Снижается не добавлением декора, а поведением:

- чёрные segments связаны с candidate pool;
- три красных wedges явно становятся hero recommendations;
- один wedge превращается в выбранный pick;
- copy никогда не называет знак абстрактным progress.

### Красный становится агрессивным

Красный используется как precision signal, а не как постоянный фон. Большие поверхности остаются paper/ink.

### WOW ухудшает performance

Смысл несут DOM и SVG. WebGL загружается позже, имеет fallback и жёсткий frame gate.

### Будущее видео ломает layout

Media и overlay разделены заранее, а timeline работает через scene states, не через конкретный `<video>`.

### GSAP становится новым монолитом

Каждый timeline имеет одну ответственность, создаётся из orchestration entry и возвращает cleanup. Компоненты не регистрируют собственные глобальные ScrollTriggers.

## 17. Финальная рекомендация

Лучший технический путь — не переносить текущий сайт в новую палитру, а:

1. превратить icon-10 в source of truth;
2. пересобрать страницу статически на Astro;
3. заменить набор карточек четырьмя непрерывными AIDA-главами;
4. реализовать три master GSAP timelines;
5. оставить один semantic WebGL field только на desktop;
6. сделать mobile motion самостоятельным;
7. заложить media-layer seam для будущего реального Dota-видео, не добавляя видео сейчас.

Это одновременно повышает WOW, уменьшает initial JS и делает следующую итерацию с реальным матч-видео локальной заменой сцены, а не ещё одним полным редизайном.

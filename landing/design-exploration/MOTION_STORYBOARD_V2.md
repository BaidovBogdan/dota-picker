# Counterpick — Motion Storyboard V2

Выбранное направление: `10 — Draft Timer`.

Цель: превратить лендинг из набора интерфейсных блоков в один непрерывный эпизод, где широкий пул вариантов под давлением таймера сужается до трёх объяснимых решений, а затем до действия — установки Counterpick.

Production-код в рамках этого storyboard не изменялся.

## Главный режиссёрский принцип

Один глагол для всей страницы: **сужается**.

- множество чёрных сегментов — кандидаты и уходящее время;
- три красных сектора — три surviving recommendations;
- открытый центр — решение остаётся за игроком;
- белые разрывы — явные этапы оценки, а не «магический» чёрный ящик;
- движение всегда идёт по часовой стрелке: входящий контекст собирается слева, проходит через верхний порог и разрешается тремя красными секторами справа.

Не добавлять стрелку часов, меч, щит, radar sweep или декоративные частицы без продуктового смысла. Иконка должна оставаться знаком отбора, а не progress indicator.

## Палитра и смысл цвета

| Роль | Цвет | Использование |
|---|---|---|
| Ink | `#101217` | основной мир, входящие кандидаты, текст на светлом фоне |
| Paper | `#F9F6F0` | hero, основной текст на тёмном фоне, negative space |
| Decision red | `#F12218` | только surviving picks, Pro, активный CTA и решающий переход |
| Ash | `rgba(249, 246, 240, 0.48)` | вторичный текст и ослабленные кандидаты |

Четвёртый самостоятельный hue не нужен. Серые состояния получаются только прозрачностью Ink или Paper. Красный занимает не более 8–10% кадра до кульминации, иначе перестаёт означать решение.

Dota-портреты сохраняют собственные цвета, но до отбора показываются с пониженной насыщенностью. Полный цвет возвращается только трём финалистам; lead pick получает красный контур, но не красный color wash.

## Единый объект: Segmented Decision Current

Decision Current выводится прямо из геометрии знака №10:

1. В hero это крупное кольцо из 12–16 чёрных сегментов и трёх красных wedges.
2. При первом scroll чёрные сегменты увеличиваются и закрывают Paper-фон, физически переводя страницу в тёмную главу.
3. Один красный wedge вытягивается в непрерывную траекторию вниз.
4. В Interest траектория получает пять каналов оценки.
5. В Desire каналы захватывают candidate portraits и отбрасывают слабые.
6. Три красные траектории раскрывают настоящий прямоугольный overlay.
7. В pricing три траектории временно становятся двумя путями Free и Pro.
8. В финале пути снова собираются в исходный glyph №10.

Смысловая линия всегда существует в SVG/DOM. WebGL может добавить глубину и редкие движущиеся импульсы, но не является источником смысла.

## Storyboard из 12 кадров

| Кадр | Состояние | Главный визуальный жест | Что понимает пользователь |
|---:|---|---|---|
| 1 | First paint | На Paper-фоне видны широкий H1, CTA и большой статический silhouette знака | Это Counterpick, desktop-приложение для решения во время драфта |
| 2 | Brand ignition | Чёрные сегменты собираются по часовой стрелке, три красных сектора встают последними | Бренд означает «много вариантов → три решения» |
| 3 | Draft enters | Пять крупных enemy portraits входят по разным дугам и занимают сегменты кольца | Приложение видит живой драфт автоматически |
| 4 | Hero proof | Кольцо быстро сужает варианты; из центрального void раскрывается overlay с тремя picks | Результат появляется прямо в игре, без screenshot, typing и alt-tab |
| 5 | Handoff | Чёрные сегменты увеличиваются до краёв viewport; красный сектор вытягивается вниз | Hero не закончился, пользователь проваливается внутрь того же решения |
| 6 | Context joins | Position, rank, matchup, current meta и team need входят в пять участков одной линии | Результат зависит от конкретного игрока и конкретного драфта |
| 7 | Candidate field | В тёмной сцене появляются 8 крупных candidate portraits, связанные с кольцом | Система действительно сравнивает поле, а не выдаёт случайный tier list |
| 8 | Five-channel scoring | Одна линия разделяется на пять ветвей разной визуальной массы | Matchup, role, meta, team fit и reliability влияют на отбор |
| 9 | Pruning | Пять слабых кандидатов теряют глубину и уходят за плоскость сцены | Понятно, почему вариантов осталось три |
| 10 | Overlay resolution | Три красные траектории сходятся; lead pick приближается, overlay раскрывается из central void; reason и risk проявляются вдоль линии | Видны три выбора, приоритет и объяснение |
| 11 | Free / Pro paths | Три линии переходят в два больших маршрута, без pricing cards; Pro остаётся красным | Можно честно начать бесплатно или выбрать постоянный Pro-доступ |
| 12 | Install resolution | Free и Pro снова сходятся в glyph; из центра раскрывается installer CTA, фон возвращается к Paper | Вся история завершается одним действием — установить приложение |

## Четыре master timeline

Все длительности ниже — режиссёрская спецификация, а не повод создавать отдельный ScrollTrigger для каждого элемента.

### 1. `introTL`: первый видимый hero, 3.2 секунды

Запускать один раз, только когда `.hero-stage` виден минимум на 70%. При восстановлении страницы ниже hero сразу показывать resolved state.

| Время | Событие |
|---:|---|
| `0.00–0.42 s` | glyph в nav собирается из двух групп: candidate arc, затем три red wedges |
| `0.10–0.88 s` | H1 раскрывается двумя широкими горизонтальными masks; не использовать обычный fade-up по строкам |
| `0.34–0.92 s` | primary и secondary CTA входят одной группой, без stagger каждого слова |
| `0.52–1.42 s` | 12–16 candidate segments поворачиваются на свои позиции по часовой стрелке |
| `0.88–1.88 s` | пять enemy portraits входят по дугам; каждый вход слегка деформирует соседние сегменты |
| `1.72–2.38 s` | слабые сегменты сжимаются в центральный поток, три red wedges получают полный scale |
| `2.16–2.92 s` | overlay раскрывается из центральной negative space через короткую mask-анимацию |
| `2.58–3.20 s` | три recommendations получают глубину; lead pick входит на 80 ms раньше остальных |

Hero-copy и primary CTA должны быть читаемы до выполнения JavaScript. Motion enhancement не должен создавать flash скрытого контента.

### 2. `journeyTL`: hero handoff и Interest

Один ScrollTrigger:

```text
trigger: .journey
start: top top
end: bottom top
scrub: 0.8
invalidateOnRefresh: true
```

Рекомендуемая высота scroll-range: `190–220 svh`. Pin не нужен; визуальная сцена работает через CSS sticky, чтобы не добавлять второй длинный desktop pin.

| Progress | Событие |
|---:|---|
| `0.00–0.12` | intro фиксируется в final state; никакого резкого исчезновения hero |
| `0.12–0.30` | H1 уменьшается и уходит на дальний план; overlay остаётся в фокусе |
| `0.20–0.43` | чёрные сегменты glyph увеличиваются и закрывают Paper-фон |
| `0.34–0.52` | нижний red wedge вытягивается в Decision Current |
| `0.48–0.72` | пять context nodes прикрепляются к траектории по одному причинному порядку: role → rank → matchup → meta → team need |
| `0.66–0.90` | текущая линия делится на пять scoring channels |
| `0.88–1.00` | каналы входят в pinned candidate scene без section cut |

Толщины пяти каналов должны передавать веса, но оставаться читаемыми: примерно `8 / 7 / 6 / 4 / 2 px`, а не буквальные 34/28/20/12/6 процентов.

### 3. `decisionTL`: pinned overlay chapter

Один desktop ScrollTrigger:

```text
trigger: .decision-chapter
start: top top
end: +=240svh
pin: true
scrub: 0.75
anticipatePin: 1
invalidateOnRefresh: true
```

Сцена должна оставаться насыщенной на всём диапазоне. В каждом состоянии меняются масштаб камеры, количество кандидатов или форма потока; не оставлять 500–700 px прокрутки только ради fade.

| Progress | Событие |
|---:|---|
| `0.00–0.10` | candidate field заполняет 70–80% viewport; восемь portraits становятся главным изображением |
| `0.10–0.27` | пять scoring channels проходят через поле; связанные кандидаты получают короткие displacement-импульсы |
| `0.27–0.48` | пять слабых кандидатов теряют saturation, уменьшаются до `0.72–0.84` и уходят по z-имитации назад |
| `0.45–0.62` | три surviving portraits перемещаются в правую часть знака и становятся тремя red wedges |
| `0.60–0.76` | lead pick приближается до `1.08`, альтернативы остаются на `0.92`; красный используется только на lead line и ranking markers |
| `0.72–0.86` | overlay раскрывается из центральной negative space, а не приезжает как ещё одна карточка |
| `0.82–0.94` | reason раскрывается последовательностью смысловых фраз; risk появляется вторым менее контрастным слоем |
| `0.92–1.00` | вся сцена стабилизируется в пригодном для чтения состоянии; пользователь может сменить scenario |

Overlay — единственный большой прямоугольный интерфейс на странице. Остальная композиция строится линиями, масками, negative space и крупными portraits.

Scenario selector не autoplay. Переключение по клику, keyboard или touch:

- `0–160 ms`: текущие три линии втягиваются к центру;
- `120–360 ms`: portraits меняются и перераспределяются;
- `260–620 ms`: пять scoring channels перестраиваются;
- `500–760 ms`: новые three picks и reason фиксируются;
- полный interaction timeline не длиннее `800 ms`.

### 4. `actionTL`: pricing, FAQ и final CTA

Один ScrollTrigger:

```text
trigger: .action-journey
start: top 76%
end: bottom bottom
scrub: 0.7
invalidateOnRefresh: true
```

| Progress | Событие |
|---:|---|
| `0.00–0.20` | три recommendation lines растягиваются и превращаются в два пути: Free и Pro |
| `0.18–0.42` | Free остаётся тонким Paper/Ink маршрутом; Pro становится более широким red маршрутом |
| `0.38–0.62` | преимущества появляются вдоль соответствующей линии, не внутри cards |
| `0.55–0.75` | FAQ использует одну общую baseline; раскрытый ответ посылает короткий pulse к следующему узлу |
| `0.70–0.90` | central void расширяется и возвращает Paper-фон без резкой смены секции |
| `0.84–1.00` | два пути сходятся; собирается полный glyph №10; из центра раскрывается основной installer CTA |

Hover, focus и tap на Free/Pro усиливают выбранную ветвь за `280–360 ms`. Смысл и цены остаются видимыми без hover.

## Естественное место для будущего реального Dota-видео

Видео должно появиться **в начале pinned Desire chapter**, между кадрами 7 и 10. Это момент, когда обещание hero уже понятно, но пользователю нужно самое сильное доказательство: настоящий матч → реальные enemy locks → появление overlay → собственный pick.

Сейчас видео, `<video>`, autoplay, source-файлы и синхронизацию добавлять не нужно.

Архитектурно сцену нужно мыслить как два независимых слоя:

1. `match media plane` — сейчас крупная синтетическая draft-сцена из portraits;
2. `product overlay plane` — настоящий DOM/SVG overlay поверх неё.

Когда запись будет готова, media plane можно заменить видео без перестройки layout, pricing и остального motion. Overlay предпочтительно не запекать окончательно в единственный видеофайл: отдельный DOM-слой останется резким на любом DPI, позволит поправить текст и даст точную адаптацию под mobile. Видеомонтаж может содержать естественные game states, а появление Counterpick синхронизируется по монтажным маркерам.

Будущая последовательность внутри этого же normalized progress:

| Progress | Видеособытие |
|---:|---|
| `0.00–0.16` | найденная игра и accept |
| `0.16–0.38` | первые enemy locks |
| `0.38–0.58` | драфт становится достаточным для анализа |
| `0.56–0.74` | появляется Counterpick overlay |
| `0.72–0.90` | lead recommendation и reason |
| `0.88–1.00` | пользователь выбирает рекомендованного героя |

Для будущего desktop-master сохранить чистую запись без вшитого сайта, курсорных подсказок и лишних zoom. Для mobile позже нужен отдельный 4:5 или 9:16 монтаж; CSS-crop desktop-записи почти наверняка обрежет важный Dota UI.

## Mobile motion

Mobile получает отдельную режиссуру, а не отключённую desktop-версию.

### Эпизод A: `mobile-intro`, `165 svh`

- sticky scene высотой `100 svh`;
- glyph занимает верхнюю половину, H1 — не более трёх строк;
- три, а не пять, enemy portraits входят простыми дугами;
- red wedges формируют компактный overlay в нижней половине;
- SVG Current вместо обязательного WebGL;
- CTA остаётся доступен и не уходит под fixed nav.

### Эпизод B: `mobile-decision`, `190 svh`

- одна sticky scene, без desktop pin;
- состояния: `8 candidates → 3 survivors → overlay + reason`;
- одновременно на экране не более пяти крупных движущихся portraits;
- scenario selector — native horizontal scroll-snap;
- pricing paths складываются вертикально, но остаются линиями, а не cards;
- touch targets минимум `48 × 48 px`;
- важная реакция не зависит от hover.

На `pointer: coarse` отключить pointer-parallax и магнитные кнопки. На mobile нельзя анимировать масштаб всей страницы или блокировать native scroll.

## Reduced motion

При `prefers-reduced-motion: reduce`:

- WebGL не инициализируется;
- все pin, scrub, MotionPath и icon assembly отключаются;
- hero сразу показывает полный glyph и конечное overlay-состояние;
- Interest становится одним статическим SVG: candidate arc → five signals → three red wedges;
- Desire показывает крупный overlay и три picks обычным document flow;
- scenario переключается без spatial flight;
- pricing остаётся двумя семантическими путями;
- FAQ работает нативным `details`;
- final glyph и CTA видны сразу;
- ни один важный текст не скрывается через initial opacity;
- будущее видео использует poster и ручной play, без autoplay.

Reduced-motion версия должна выглядеть как намеренный editorial layout, а не как остановленная анимация.

## Performance guardrails

### Motion architecture

- четыре master timeline: `introTL`, `journeyTL`, `decisionTL`, `actionTL`;
- не более 5–6 ScrollTrigger на всю страницу;
- interaction timelines не создают собственные scroll triggers;
- использовать `gsap.matchMedia`;
- анимировать `transform`, `opacity`, SVG stroke и короткие mask/clip-path;
- не scrub-анимировать `width`, `height`, `top`, `left`, blur и CSS filter;
- без smooth-scroll dependency, custom cursor, forced sound и loading gate;
- `ScrollTrigger.refresh()` только после fonts и responsive media decode.

### SVG / WebGL

- SVG является обязательным meaning layer и fallback;
- максимум один deferred WebGL canvas;
- один render pass;
- DPR максимум `1.5` desktop и `1` mobile;
- `120–180` instanced pulses в обычном desktop режиме, абсолютный предел `220`;
- на mobile high-tier максимум `60–90` pulses;
- остановка ticker при hidden tab и вне активной главы;
- downgrade после устойчивого среднего frame time выше `20 ms`;
- WebGL не рисует текст, portraits, overlay, pricing или CTA.

### Assets

- first paint, H1 и CTA не зависят от React hydration;
- LCP asset не находится внутри canvas;
- hero portraits — responsive AVIF/WebP, без растягивания 64 px icons;
- preload только LCP и первый proof frame;
- последующие portraits загружаются перед входом в decision chapter;
- маленькая повторяемая grain texture или shader noise, не 4K overlay;
- будущему видео: poster до `180 KB`, `preload="metadata"`, отдельные desktop/mobile encodes, отключение autoplay при `saveData` и reduced motion.

### Целевые бюджеты

| Метрика | Цель |
|---|---:|
| Initial JS | `≤ 150–165 KB gzip` |
| Deferred WebGL | `≤ 180 KB gzip` |
| CSS | `≤ 35 KB gzip` |
| Fonts | `≤ 60 KB` суммарно |
| LCP | `≤ 2.5 s` |
| INP | `≤ 200 ms` |
| CLS | `≤ 0.05` |
| Animation frame | `16.7 ms`, downgrade после устойчивых `20 ms` |

## Что не переносить из текущего лендинга

- текущий `DraftCore` с icosahedron;
- отдельный hero demo, ProofBento и второй live demo как три повтора одного процесса;
- trust band и telemetry marquee;
- pricing cards;
- резкие black/bone/acid chapter cuts;
- framed scenario console;
- scroll-trigger на каждую карточку;
- autoplay, который может завершиться до попадания proof-сцены в viewport.

Сохранить нужно продуктовые факты, English copy и реальный rectangular overlay. Остальное должно быть пересобрано вокруг glyph №10 и одной истории сужения.

## Acceptance criteria

1. Один статический кадр без wordmark узнаётся по segmented ring и трём red wedges.
2. В первом viewport понятны automatic detection, in-game overlay и three explained picks.
3. Hero и final CTA используют один и тот же glyph и обратный переход Paper → Ink → Paper.
4. В wireframe нет bento, dashboard grid и двух pricing cards.
5. Каждые 15–25% pinned progress дают крупное перцептивное изменение.
6. Overlay остаётся единственным большим прямоугольником.
7. Mobile рассказывает тот же сюжет двумя короткими sticky-эпизодами.
8. Reduced motion показывает всю историю без скрытого контента.
9. Future Dota video заменяет только media plane и не требует перестройки страницы.
10. WOW не зависит от WebGL, звука, custom cursor или тяжёлого smooth scroll.

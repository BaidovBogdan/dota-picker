# Counterpick: conversion architecture v2

Дата: 27 июля 2026 года.

Роль аудита: senior product marketer + UX critic.

Основание:

- текущий landing source;
- текущая продуктовая документация;
- recommendation engine и quota configuration;
- `REDESIGN_AUDIT.md`;
- выбранная иконка №10;
- уточнённый desktop-сценарий: пользователь только устанавливает и запускает приложение, Counterpick сам видит live draft и показывает рекомендации в игровом overlay;
- реальное gameplay-видео будет подготовлено позже и сейчас не должно появляться на странице.

Production-код в рамках этого отчёта не изменялся.

## Главный вывод

Counterpick нужно продавать не как «ещё один AI-инструмент для Dota» и не как базу контрпиков. Его уникальная коммерческая ценность — **решение приходит внутрь текущего драфта без отдельного пользовательского ритуала**.

Правильная смысловая последовательность:

> Launch Counterpick once → keep drafting in Dota → see three explained options in the overlay → choose with context → upgrade when the tool becomes part of every queue.

Текущая страница достаточно хорошо перечисляет функции, но слабо ведёт к покупке:

1. Hero даёт обещание, но основное доказательство находится слишком низко.
2. Затем та же ценность повторяется в trust band, telemetry, bento, live draft и scenario console.
3. До pricing пользователь проходит слишком длинный продуктовый каталог.
4. Free и Pro отличаются квотой, но текущая подача пытается визуально сделать их обычными SaaS-пакетами.
5. Основной CTA меняет формулировку, а в pre-release состоянии становится почти тупиком.
6. На странице нет одного честного proof-момента, который отвечает на главный вопрос: «Я правда ничего не ввожу, а подсказка появляется в самой игре?»

Редизайн должен сократить число тезисов и усилить доказательную последовательность. Пользователь должен за первые 5–8 секунд понять:

- это Windows desktop app для Dota 2;
- оно следит за live draft автоматически;
- в игре появляются три ранжированных рекомендации;
- от пользователя не нужны скриншоты, ввод героев и alt-tab;
- сейчас можно либо скачать приложение, либо честно увидеть статус релиза.

## Что Counterpick на самом деле продаёт

### Категория

**An in-game draft decision layer for Dota 2.**

Не использовать как основную категорию:

- AI counterpick generator;
- Dota analytics dashboard;
- tier list;
- hero database;
- screenshot analyzer;
- coaching platform.

Эти формулировки либо делают продукт взаимозаменяемым, либо описывают старый mobile flow.

### Job to be done

> When the pick timer is running, show me three defensible heroes for this exact draft, inside the game, before I have to commit.

### Эмоциональная ценность

Не «стать профессионалом» и не «гарантированно поднять MMR». Это неподтверждённые обещания.

Реальная эмоция:

- меньше паники под таймером;
- меньше метаний между вкладками и знаниями из памяти;
- больше уверенности в том, почему выбор подходит;
- ощущение, что пользователь всё ещё принимает решение сам.

### Рациональная ценность

- автоматический desktop flow;
- три ранжированных варианта вместо одного магического ответа;
- роль и ранг пользователя;
- matchup evidence;
- current-patch role meta;
- team fit;
- sample reliability;
- причины и риски выбора;
- прозрачная квота Free и Pro.

## Message hierarchy

Сообщения должны появляться в следующем порядке:

1. **Outcome:** three explained picks appear inside the live draft.
2. **Friction removal:** no screenshots, typing, or alt-tab.
3. **Mechanism:** position, rank, meta, matchups, team fit, reliability.
4. **Control:** Counterpick recommends; the player still picks.
5. **Proof:** the overlay forms from a visible draft.
6. **Commercial choice:** Free is enough to test the complete loop; Pro is for repeated use.
7. **Trust:** verified facts, explicit unknowns, release specifications.

Нельзя открывать продажу с OpenDota, AI, scoring weights или subscription quota. Это аргументы после понимания основного результата.

## Рекомендуемое главное обещание

### Основная версия

```text
THE DRAFT MOVES.
YOUR ANSWER APPEARS.
```

```text
Counterpick follows the live Dota 2 draft and surfaces three role-aware,
data-backed options in an in-game overlay. No screenshots, no typing,
no alt-tab.
```

Почему это сильнее текущего `THE RIGHT PICK. ALREADY IN YOUR GAME.`:

- не обещает объективно «правильный» пик;
- передаёт автоматическое появление ответа;
- содержит причинно-следственное движение, которое можно сделать единым motion-языком;
- легко помещается в две широкие строки;
- работает с иконкой №10: draft timer раскрывается и сходится в три красных recommendation wedges.

### Допустимая более прямая версия

```text
THREE PICKS.
RIGHT INSIDE YOUR DRAFT.
```

```text
Launch Counterpick, open Dota 2, and keep drafting. The desktop app follows
the visible draft and brings three explained recommendations into the game.
```

Она лучше для performance-маркетинга и paid traffic, но чуть менее кинематографична.

### Не использовать

```text
WIN MORE GAMES WITH AI.
```

```text
THE PERFECT COUNTERPICK, EVERY TIME.
```

```text
GAIN MMR FASTER.
```

```text
UNBEATABLE PICKS IN SECONDS.
```

Эти обещания не подтверждены, звучат как low-trust gaming utility и создают ожидание гарантии результата.

## CTA contract

У страницы должен быть один главный коммерческий глагол в каждом release-state. Навигация, hero, pricing и final CTA используют один и тот же target.

### Когда installer доступен

Primary CTA:

```text
Download Counterpick
```

или, если Windows остаётся единственной платформой:

```text
Download for Windows
```

Microcopy:

```text
Free plan included. Upgrade inside the app.
```

Не показывать размер installer, номер версии и требования до появления проверенных данных.

### Когда доступна beta

Primary CTA:

```text
Join the Windows beta
```

Secondary CTA:

```text
See how it works
```

Не писать `Download`, если ссылка ведёт на waitlist или форму.

### Когда нет ни installer, ни beta URL

Нельзя делать псевдоактивную кнопку `Beta soon`, которая ведёт в ещё один промо-блок.

Честное состояние:

```text
Windows release in development
```

Primary action должен существовать только при наличии реального следующего шага:

- `Get release updates`, если есть рабочая форма подписки;
- `View release details`, если есть содержательная status-section;
- обычный статус без button affordance, если действия нет.

Нельзя создавать фальшивую конверсию кликом по недоступному installer.

### Secondary CTA сейчас и после появления видео

Сейчас:

```text
See the draft resolve
```

CTA ведёт к интерактивной продуктовой сцене.

После появления реального gameplay-видео:

```text
Watch real gameplay
```

Нельзя сейчас писать `Watch a live draft`, когда посетителю показывается scripted interface simulation.

## Строгая AIDA-структура

Страница должна состоять из четырёх больших коммерческих глав, а не из набора независимых feature sections.

### Navigation

Рекомендуемые links:

```text
How it works
Plans
Questions
```

Primary action:

```text
Download for Windows
```

или соответствующий честный release-state.

Почему не нужны `Product` и `Evidence`:

- это внутренние категории команды, а не пользовательские намерения;
- `How it works` отвечает на главный вопрос нового посетителя;
- `Plans` быстрее ведёт high-intent traffic к покупке;
- `Questions` снижает риск установки.

Навигация не должна становиться полноценным интерфейсным dashboard. Иконка №10, wordmark и один CTA достаточны.

---

## Attention: promise and proof in the first viewport

### Задача

За один экран объяснить продукт и показать, что рекомендация появляется именно в Dota, а не в отдельном web-приложении.

### Copy

Eyebrow допустим только как спокойная строка контекста, не как pill:

```text
COUNTERPICK FOR WINDOWS
```

H1:

```text
THE DRAFT MOVES.
YOUR ANSWER APPEARS.
```

Supporting copy:

```text
Counterpick follows the live Dota 2 draft and surfaces three role-aware,
data-backed options in an in-game overlay. No screenshots, no typing,
no alt-tab.
```

Primary CTA:

```text
Download for Windows
```

Secondary CTA:

```text
See the draft resolve
```

CTA microcopy при доступном installer:

```text
Start free. Choose Pro when you need it every game.
```

### Visual proof

В первом viewport должны одновременно быть видны:

- часть реального Dota draft context или честно помеченного interface preview;
- появляющиеся enemy picks;
- движение выбранного timer glyph;
- три рекомендации;
- сам in-game overlay.

Hero не должен сначала показывать только крупный заголовок, а затем заставлять прокручивать до продукта.

### Что пользователь должен суметь повторить после hero

> “I install it, launch Dota, and it shows me three explained picks in the game.”

Если пользователь говорит «это AI-сайт с контрпиками», hero недостаточно точен.

---

## Interest: zero-friction workflow

### Задача

Снять первое практическое возражение: «Что мне придётся делать во время драфта?»

### H2

```text
JUST LAUNCH IT.
KEEP DRAFTING.
```

### Supporting copy

```text
Counterpick is built around the desktop flow: open the app, start Dota 2,
and stay in the draft. The visible picks become context automatically.
```

### Три смысловых состояния одного потока

#### The draft appears

```text
Enemy picks and your active role enter the decision field as the draft changes.
```

#### The field narrows

```text
Matchup evidence, role fit, current-patch role meta, team fit, and sample
reliability reduce the candidate pool.
```

#### Three lines reach the overlay

```text
You see a lead recommendation, two alternatives, and the reason each line fits.
```

### Обязательная anti-friction строка

```text
No screenshots. No hero search. No alt-tab.
```

Её нужно показать один раз крупно. Не повторять в hero, trust band, bento и FAQ как четыре независимых feature claims.

### Что не должно вернуться

- trust band из четырёх ячеек;
- telemetry marquee;
- четыре feature cards;
- иконка рядом с каждым очевидным тезисом;
- повторная hero demo внутри этой же главы.

---

## Desire: candidate collapse and explainability

### Задача

Показать, что Counterpick не выдаёт случайный hero name и не заменяет решение пользователя.

### H2

```text
EIGHT CANDIDATES.
THREE LINES YOU CAN DEFEND.
```

### Supporting copy

```text
Counterpick does not hand you a mystery answer. It narrows the field, ranks
three options, and shows why the lead pick fits this draft.
```

### Кульминация

Один большой visual sequence:

1. В поле входят восемь candidates.
2. Position и rank ограничивают role fit.
3. Current-patch role meta и rolling matchup evidence влияют на линии отдельно.
4. Team fit меняет порядок.
5. Low-confidence branches теряют вес.
6. Остаются три рекомендации.
7. Lead pick показывает concise reason.
8. Risk или limitation показан вторым уровнем, а не спрятан.

### Copy для explanation state

```text
WHY THIS PICK
Pressures the enemy front line while preserving the active mid role.
```

```text
WATCH FOR
Matchup coverage is limited for one visible opponent.
```

Risk copy должна приходить из реальных данных или быть ясно помеченным illustrative example. Нельзя генерировать драматический риск ради визуала.

### Engine trust

H3:

```text
DATA BUILDS THE POOL.
AI CAN ONLY BREAK A CLOSE CALL.
```

Body:

```text
The deterministic engine ranks candidates from matchup evidence, role fit,
current-patch role meta, team fit, and sample reliability. AI may reorder close
options when the supplied evidence supports it; it does not invent the pool.
```

Это сильнее общего `AI-powered`, потому что:

- соответствует текущей архитектуре recommendation engine;
- снижает страх black box;
- не делает AI основной причиной покупки;
- оставляет продукту fallback, если AI advisor недоступен.

### Что не показывать как постоянный marketing claim

Текущие фиксированные bars `34 / 28 / 20 / 12 / 6` можно использовать внутри illustrative interface, если они действительно отражают текущую версию engine. Не следует превращать их в вечное обещание бренда:

- веса могут меняться;
- пользователь может ошибочно принять их за проценты;
- точные числа не усиливают основную ценность;
- визуально они снова возвращают dashboard.

На лендинге важнее показать причинность и reliability, чем формулу.

---

## Reserved gameplay proof chapter

### Задача

Архитектура должна принять будущее реальное видео без полного редизайна, но сейчас нельзя показывать пустой video-placeholder или имитировать gameplay.

### Постоянный заголовок

```text
FROM MATCH FOUND
TO PICK LOCKED.
```

### Постоянный supporting copy

```text
One uninterrupted flow: accept the match, watch the draft unfold, and choose
from the recommendations that appear inside the game.
```

Эта формулировка подходит и к текущей DOM-сцене, и к будущей записи.

### Состояние сейчас

- chapter визуально продолжает Decision Current;
- используется interactive interface preview;
- рядом с самой сценой стоит компактная честная подпись `Interface preview`;
- нет video controls, play button и слова `gameplay`;
- нет пустого 16:9 прямоугольника «video coming soon».

### Состояние после подготовки ролика

Тот же visual stage принимает:

- реальную запись: match found → accept → draft → enemy picks → own pick;
- добавленный Counterpick overlay в момент, когда приложение формирует рекомендацию;
- poster frame с уже видимым overlay;
- subtitles или captions;
- mute-by-default;
- play/pause control;
- короткую подпись, различающую запись и монтаж.

Допустимая подпись после появления подтверждённой desktop build:

```text
Recorded Dota 2 gameplay. Counterpick overlay shown in the Windows build.
```

Если overlay пока добавлен только в post-production как концепт, подпись должна быть честнее:

```text
Recorded Dota 2 gameplay with a preview of the planned Counterpick overlay.
```

Нельзя выдавать composited concept за работающий build.

### Почему chapter нужно резервировать именно здесь

- после объяснения механизма пользователь уже понимает, на что смотреть;
- до pricing он получает сильнейшее proof;
- copy и layout не придётся перестраивать после появления видео;
- real gameplay станет доказательством ценности, а не декоративным background.

---

## Action: pricing as frequency, not intelligence

### Главный pricing truth

Free и Pro используют один recommendation engine. Pro не должен выглядеть как «умные рекомендации», а Free — как намеренно плохой ответ.

Коммерческое различие сейчас — **частота использования**.

Это нужно сказать прямо:

```text
SAME ENGINE.
MORE DRAFTS.
```

### H2

```text
TRY THE COMPLETE LOOP.
GO PRO FOR THE ROUTINE.
```

### Supporting copy

```text
Free is enough to test Counterpick in real drafts. Pro keeps the overlay ready
when it becomes part of every queue.
```

### Free path

Name:

```text
FREE
```

Price:

```text
$0
```

Promise:

```text
Test the full decision flow before you subscribe.
```

Verified inclusions:

```text
3 draft analyses to start
1 analysis returns every 24 hours, up to 3
3 ranked recommendations per analysis
The same recommendation engine as Pro
```

CTA:

```text
Download free
```

Не писать `No card required` до подтверждения конкретного desktop onboarding и billing flow.

### Pro path

Name:

```text
PRO
```

Price:

```text
Localized monthly or annual price
```

До подключения реального billing price нельзя использовать красивый выдуманный price point.

Promise:

```text
Keep Counterpick ready across your ranked sessions.
```

Verified inclusions:

```text
Up to 100 draft analyses every 24 hours
The same transparent recommendation engine
Monthly and annual purchase options
```

CTA зависит от purchase flow:

- `Choose Pro`, если сайт ведёт в реальный checkout;
- `Download and choose Pro`, если upgrade происходит внутри desktop app;
- `Join the beta`, если Pro ещё нельзя купить.

Нельзя показывать `Buy Pro`, если после клика пользователь только скачивает приложение без возможности оформить план.

### Visual hierarchy

Pro должен быть основным желаемым путем, но Free не должен выглядеть ловушкой:

- Pro получает большую визуальную массу и красный active current;
- Free остаётся полноценной ветвью, а не бледной disabled-card;
- список общих возможностей не дублируется дважды;
- различие quota показывается крупно;
- annual savings отображается только из реальных billing values;
- никаких `Most popular`, `Best value`, `Players' choice` без данных.

### Критический нерешённый вопрос до публикации pricing

Нужно определить и зафиксировать:

> What exactly consumes one draft analysis in the automatic desktop flow?

Пользователь не должен думать, что каждый новый enemy lock расходует отдельную единицу quota.

До релиза необходимо документировать:

- когда analysis начинается;
- может ли один draft пересчитываться несколько раз;
- какой момент списывает quota;
- возвращается ли quota при ошибке detection или analysis;
- расходуется ли quota в demo/tutorial;
- что происходит при disconnect.

Текущий backend умеет расходовать и возвращать quota на уровне analysis, но desktop interaction contract ещё должен быть определён. Без этого число `100` выглядит большим, но не объясняет реальную ценность.

### Billing details, которые нельзя скрывать после запуска

Когда purchase flow готов, рядом с ценой должны быть:

- billing period;
- renewal behavior;
- tax behavior;
- точное annual saving, если есть;
- способ отмены;
- refund link;
- terms и privacy.

`Cancel anytime` допустимо только после проверки реального billing flow и политики.

---

## Trust without fake claims

### Что можно утверждать сейчас на основании кода

| Claim | Статус | Рекомендуемая формулировка |
|---|---|---|
| Три рекомендации | Подтверждено API schema и service | `Three ranked recommendations per analysis.` |
| Position-aware | Подтверждено ranking engine | `Built around the active P1–P5 role.` |
| Rank-aware | Подтверждено draft и meta flow | `Recommendations account for the selected rank context.` |
| Matchup evidence | Подтверждено engine | `Uses rolling matchup evidence.` |
| Current-patch role meta | Подтверждено OpenDota adapter | `Uses a current-patch role-meta window when available.` |
| Team fit | Подтверждено engine | `Accounts for the needs already covered by the team.` |
| Reliability | Подтверждено engine | `Lowers confidence when coverage or sample quality is limited.` |
| Constrained AI | Подтверждено adapter и fallback | `AI may reorder close candidates; it does not invent the pool.` |
| Free quota | Подтверждено server config | `3 to start; 1 returns every 24 hours, up to 3.` |
| Pro quota | Подтверждено server config | `Up to 100 analyses every 24 hours.` |
| Independent project | Подтверждается ownership/disclaimer | `Counterpick is not affiliated with or endorsed by Valve.` |

### Что является desktop product commitment, но пока не подтверждено готовым build

Эти claims можно использовать как описание планируемого продукта только вместе с честным release-state:

- automatic live-draft detection;
- in-game overlay;
- no screenshot desktop flow;
- Windows installer.

До тестирования нельзя добавлять к ним абсолюты:

- `works with every display mode`;
- `instant`;
- `zero setup`;
- `always detects`;
- `never misses a pick`.

### Что нельзя утверждать до измерения или юридической проверки

- VAC-safe;
- Valve-approved;
- undetectable;
- zero FPS impact;
- no performance impact;
- less than N milliseconds latency;
- installer size;
- supported Windows versions;
- supported fullscreen/display modes;
- CPU/GPU/RAM requirements;
- privacy guarantees;
- no game data leaves the device;
- exact detection method;
- signed installer;
- auto-update behavior;
- accuracy percentage;
- win-rate lift;
- MMR increase;
- number of users or downloads;
- testimonials;
- professional-player endorsement;
- awards, media logos, partner logos.

### Правильная trust-механика до релиза

Не заменять social proof выдуманными numbers. Вместо этого дать короткое release commitment:

```text
Before the Windows release, we will publish supported display modes,
the detection method, measured performance impact, data handling,
installer details, and version compatibility.
```

После появления build этот текст должен быть заменён на фактическую specification, а не оставаться вечным promise.

### Важное возражение: anti-cheat и compatibility

Игроки Dota закономерно спросят, как overlay взаимодействует с игрой. Нельзя прятать этот вопрос, но нельзя отвечать `VAC-safe` без подтверждения.

До проверки:

```text
How does Counterpick interact with Dota 2?

The Windows release notes will document the detection and overlay method,
supported display modes, and compatibility findings before download access opens.
```

После проверки ответ должен ссылаться на конкретный документ с датой и версией.

## Objection map

Возражения нужно закрывать в порядке возникновения, а не складывать все в FAQ.

| Возражение | Где закрыть | Ответ |
|---|---|---|
| «Что это?» | Hero | Windows desktop app with an in-game draft overlay |
| «Мне надо загружать скриншоты?» | Hero | `No screenshots, no typing, no alt-tab.` |
| «Оно само видит draft?» | First visual proof | Показать automatic draft → overlay transformation |
| «Почему именно эти герои?» | Candidate collapse | Показать role, rank, matchup, meta, team fit и reliability |
| «AI выдумывает ответ?» | Engine trust | Deterministic pool first, constrained AI only for close calls |
| «Я потеряю контроль над выбором?» | Recommendation reveal | Lead + two alternatives + reason + risk |
| «Это реальная игра или макет?» | Proof caption | Сейчас `Interface preview`; позже честная gameplay caption |
| «Повлияет ли на FPS?» | FAQ/release spec | Не обещать до measurement |
| «Есть ли риск для аккаунта?» | FAQ/release spec | Не обещать VAC status до compatibility review |
| «Что даёт Pro?» | Pricing | Usage frequency, not better intelligence |
| «Что расходует quota?» | Pricing FAQ | Определить desktop analysis contract до релиза |
| «Можно ли уже установить?» | Nav, hero, final CTA | Один честный release-state на всей странице |

## Recommended FAQ

FAQ не должен повторять hero. Он должен закрывать high-intent риски.

### 1

```text
Do I need to upload screenshots or enter heroes manually?
```

```text
No. The Windows experience is designed around automatic live-draft detection
and an in-game overlay. The mobile screenshot flow is not part of the desktop journey.
```

Пока desktop build не готов, `is designed around` честнее, чем `automatically detects every draft`.

### 2

```text
How does Counterpick choose the three recommendations?
```

```text
A deterministic engine builds and ranks the candidate pool from matchup
evidence, role fit, current-patch role meta, team fit, and sample reliability.
AI may reorder close candidates when the supplied evidence supports it.
```

### 3

```text
Is all of the data tied to the current patch?
```

```text
Role meta uses a current-patch window. Matchup evidence uses a broader rolling
sample so sparse pairings do not appear more certain than they are.
Confidence falls when coverage or sample quality is limited.
```

Это важная честная оговорка. Нельзя сокращать её до `Always up to date`.

### 4

```text
What uses one draft analysis?
```

Ответ добавить только после определения desktop quota contract.

### 5

```text
What is the difference between Free and Pro?
```

```text
Both plans use the same recommendation engine. Free starts with three analyses
and returns one every 24 hours up to three. Pro refills up to 100 analyses every
24 hours for regular use.
```

### 6

```text
How does Counterpick interact with Dota 2?
```

Pre-release ответ должен обещать публикацию конкретной compatibility specification, а не безопасность без доказательств.

### 7

```text
What will be verified before the Windows release?
```

```text
Supported Windows and display modes, detection method, data handling,
measured performance impact, installer size, version, and compatibility findings.
```

После релиза этот вопрос заменяется конкретными system requirements и release notes.

## Final CTA

Финал должен разрешать ту же метафору, что hero: множество timer segments сходятся в три красных wedges и затем в выбранную иконку №10.

### H2 при доступном installer

```text
THE NEXT DRAFT
STARTS WITH ONE DOWNLOAD.
```

Body:

```text
Install Counterpick, launch Dota 2, and meet your next three options inside the game.
```

CTA:

```text
Download for Windows
```

Microcopy:

```text
Free plan included. Pro available when you need more drafts.
```

### H2 в pre-release состоянии

```text
THE WINDOWS BUILD
IS TAKING SHAPE.
```

Body:

```text
Release access opens after compatibility, performance, and data handling are documented.
```

Action только при наличии реального beta или updates flow.

## Color semantics for icon №10

Выбранная black / white / red palette может улучшить конверсию только при строгой семантике.

Рекомендуемые роли:

- black: основной world и cinematic depth;
- warm white: typography, clarity, unlocked information;
- red: active recommendation, Pro path, primary CTA и final convergence;
- neutral gray: secondary copy, unavailable branches, caveats.

Красный нельзя одновременно использовать для:

- enemy threat;
- errors;
- lead recommendation;
- CTA;
- Pro;
- every hover.

Иначе он перестаёт означать действие.

Лучший вариант:

- enemy picks получают white/graphite tension;
- active decision и primary CTA получают red;
- risk показывается формой, pattern или muted neutral, а не вторым ярким hue;
- дополнительный цвет не нужен, пока интерфейс читается через contrast и motion.

Если потребуется четвёртый цвет для system/trust state, использовать один холодный muted accent только в utility copy. Он не должен конкурировать с красным Decision Current.

## Что удалить из текущего conversion flow

### Hero

- `THE RIGHT PICK` как абсолютное обещание;
- две служебные строки `A LIVE DRAFT DECISION LAYER` и `DOTA 2 · WINDOWS` одновременно;
- CTA `Watch a live draft` до появления реального видео;
- продуктовую demo ниже первого доказательного viewport.

### Middle

- trust band;
- telemetry marquee;
- ProofBento;
- повторяющиеся claims;
- `ONE LIVE DRAFT` как meta-label;
- framed scenario console;
- scoring bars как отдельный dashboard;
- section kickers на каждой главе;
- несколько разных визуальных демонстраций одного процесса.

### Pricing

- `FREE TO FEEL THE EDGE`, потому что это vibe-copy без содержания;
- `Launch pricing` вместо реальной цены или честного `Price shown when plans open`;
- два почти одинаковых CTA;
- впечатление, что Pro даёт лучший engine;
- `Start without a card` до проверки desktop billing;
- SaaS badge `Most popular` без данных.

### Release

- отдельный acid-colored world;
- недоступный CTA, стилизованный как активная кнопка;
- обещание performance/compatibility без документа;
- повторение hero вместо конкретного next step.

## Content density rules

Для максимального WOW и конверсии copy должна быть короче текущей:

- один H1;
- три H2 на основной story;
- pricing H2;
- final CTA H2;
- один крупный anti-friction claim;
- один engine-trust paragraph;
- максимум семь FAQ;
- один proof scene;
- один pricing choice;
- один install action.

Большие интервалы работают только тогда, когда Decision Current продолжает действие между главами. Пустой scroll без нового доказательства конверсию снижает.

## Mobile conversion order

На mobile нельзя просто сложить desktop-главы вертикально.

Рекомендуемый порядок:

1. H1 и one-sentence promise.
2. Primary CTA.
3. Короткая sticky product proof.
4. `No screenshots. No typing. No alt-tab.`
5. Candidate collapse to three.
6. Engine trust.
7. Reserved gameplay proof chapter.
8. Pro-first pricing choice, затем Free alternative.
9. Critical FAQ.
10. Final install CTA.

На mobile Pro можно показывать первым в pricing, если Free остаётся явно доступен сразу ниже и не скрывается за accordion.

Primary CTA должен быть виден без горизонтального clipping и не зависеть от hover.

## Conversion analytics

Без измерения невозможно понять, даёт ли WOW коммерческий результат.

Минимальные события:

- `hero_primary_cta`;
- `hero_proof_cta`;
- `proof_completed`;
- `scenario_changed`;
- `pricing_viewed`;
- `plan_selected_free`;
- `plan_selected_pro`;
- `download_started`;
- `beta_join_started`;
- `faq_opened` с question id;
- `final_cta`;
- `installer_link_error`.

Primary KPI после релиза:

- qualified download starts per unique visitor;
- completed Pro checkouts per pricing viewer;
- download-to-first-launch, если desktop telemetry и consent позволяют это измерять.

До релиза:

- beta join completion, если форма существует;
- proof engagement;
- pricing reach;
- return visits после release update.

Нельзя оптимизировать только общий CTA click-through, если CTA ведёт в пустой release-section.

## Copy tests после первой стабильной версии

Тестировать только после появления работающего conversion path.

### Hero promise

Variant A:

```text
THE DRAFT MOVES.
YOUR ANSWER APPEARS.
```

Variant B:

```text
THREE PICKS.
RIGHT INSIDE YOUR DRAFT.
```

### Proof CTA

Variant A:

```text
See the draft resolve
```

Variant B после появления видео:

```text
Watch real gameplay
```

### Pricing frame

Variant A:

```text
TRY THE COMPLETE LOOP.
GO PRO FOR THE ROUTINE.
```

Variant B:

```text
SAME ENGINE.
MORE DRAFTS.
```

Нельзя одновременно тестировать новый hero, pricing hierarchy и CTA target: результат будет невозможно интерпретировать.

## Acceptance checklist

Новая страница готова с точки зрения conversion, если:

- за 5 секунд понятно, что это Windows desktop overlay для Dota 2;
- пользователь не предполагает, что ему нужно делать screenshot;
- automatic draft → three picks → explanation видны до длинного scroll;
- H1 занимает не более двух-трёх строк;
- только один visual object проходит hero, proof, pricing и CTA;
- simulated interface не называется real gameplay;
- chapter под будущее gameplay-видео уже встроен, но не выглядит placeholder;
- один release-state используется во всех CTA;
- недоступный installer не выглядит доступным;
- Free и Pro различаются честно;
- Pro не обещает более умный engine;
- точная quota объяснена;
- определено, что расходует один desktop analysis;
- AI не является главным hero claim;
- current-patch и rolling data не смешаны в одно ложное `real-time meta`;
- нет MMR, win-rate, accuracy, VAC, FPS и social-proof claims без evidence;
- compatibility и performance получают конкретную release specification;
- primary CTA остаётся видимым и понятным на mobile;
- final CTA завершает ту же историю, а не открывает новый рекламный блок.

## Итоговая рекомендуемая страница

```text
NAV
Icon 10 + Counterpick
How it works / Plans / Questions
One release-aware CTA

ATTENTION
The draft moves. Your answer appears.
One explicit desktop-overlay sentence
Primary install/beta CTA
Secondary proof CTA
Draft → three recommendations visible in first viewport

INTEREST
Just launch it. Keep drafting.
Draft appears → evidence narrows → three options reach overlay
One large no-screenshot/no-typing/no-alt-tab statement

DESIRE
Eight candidates. Three lines you can defend.
Candidate collapse
Lead + alternatives + reason + risk
Deterministic engine first, constrained AI second

PROOF
From match found to pick locked.
Current honest interface preview
Future real gameplay video in the same stage

ACTION
Try the complete loop. Go Pro for the routine.
Pro emphasized by usage frequency
Free remains complete and honest
Exact release-aware CTA

TRUST / FAQ
Data freshness nuance
Analysis consumption
Compatibility and performance
Free vs Pro
Release specification

FINAL CTA
Decision Current converges into icon 10
One download/beta action
Independent-project disclaimer
```

Главный маркетинговый принцип редизайна:

> Do not sell more features. Sell one uninterrupted moment in which the draft changes and the answer appears inside the game.

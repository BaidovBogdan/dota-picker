# Counterpick: пять направлений главного экрана

Это отдельный дизайн-превью. Код Expo-приложения в `client` не изменён.

Открыть галерею: `index.html`. Переключение между вариантами работает кнопками сверху и стрелками клавиатуры.

## Продуктовая опора

Counterpick помогает игроку под таймером драфта:

1. Считать состав с фото или внести героев вручную.
2. Зафиксировать свою позицию и ранг.
3. Получить три подходящих контрпика с причинами и рисками.
4. Продолжить незаконченный драфт или открыть прошлый результат.

Единственная работа первой страницы — начать или продолжить драфт. Это не каталог героев, не dashboard метрик и не витрина возможностей.

Во всех пяти концепциях намеренно использован один сценарий:

- патч `7.41d`;
- позиция `POS 2 · MID`;
- ранг `Ancient V`;
- три соперника: Pudge, Axe, Disruptor;
- три доступные попытки;
- основное действие — сканирование;
- вторичное действие — ручной ввод;
- возможность продолжить последний драфт.

Так сравнивается дизайн, а не разный набор контента.

## Что показал ресерч

- [Dota Plus](https://www.dota2.com/plus) подтверждает, что ценность рекомендации строится на контексте союзников, соперников, роли и текущей ситуации.
- [STRATZ](https://stratz.com/) и [Dota2ProTracker](https://dota2protracker.com/meta) показывают важность патча, позиции, bracket и происхождения данных.
- [Dota2Picker](https://dota2picker.com/) и [Hero Picker Pro](https://play.google.com/store/apps/details?id=com.allattentionhere.heropickerpro) быстро вводят состав, но визуально остаются каталогом или Material-утилитой.
- [Dota Captain](https://dotacaptain.com/) хорошо создаёт ощущение начала драфта, но его desktop-плотность нельзя переносить на телефон.
- [Mobalytics Live Companion](https://mobalytics.gg/blog/lol-mobalytics-beginners-guide/) полезен фазовым подходом: интерфейс меняется вместе с pre-game, game и post-game.
- [Google Material 3 Expressive research](https://design.google/library/expressive-material-design-google-research) связывает выразительные цвет, форму, размер, motion и containment с более быстрым нахождением главных действий.
- [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) рекомендует использовать системный glass как верхний функциональный слой и не закрывать им содержимое.
- [Официальные патчноуты 7.41d](https://www.dota2.com/patches/7.41d) использованы как актуальный маркер для превью от 23 июля 2026 года.

Рыночные клише, которые намеренно исключены:

- чёрно-фиолетовый dashboard с cyan glow на каждой карточке;
- gold gaming UI с искрами без собственной идеи;
- одинаковые карточки радиусом 16–24 px;
- магическая AI-сфера и sparkle-иконка как главный образ;
- таблица из 126 героев на первой странице;
- мелкие проценты раньше понятного ответа;
- копирование desktop-клиента Dota на телефон.

## 01. Draft War Room

Палитра:

- Field black `#10130F`
- Aged brass `#C3A263`
- Radiant signal `#58C5BB`
- Dire signal `#AF5A50`
- Tactical bone `#EDE7DA`

Типографика: Barlow Condensed, IBM Plex Sans, IBM Plex Mono.

Композиция:

```text
[CP/02]        [7.41d] [3/3]
СОБЕРИ ОТВЕТ ДО СИГНАЛА.
[enemy intel: 3 heroes + 2 slots]
---------- counter route ----------
[POS 2 · MID]           [change]
[      scan draft      ][camera]
[unfinished draft →]
[draft] [history] [profile]
```

Сигнатура — тактическая карта с маршрутом контрпика. Риск потрачен на фактуру командного пункта; всё остальное сдержанно.

Масштабирование на другие страницы:

- photo review становится разбором разведданных;
- analysis — прокладкой маршрута;
- result — tactical dossier с тремя кандидатами;
- history — архивом операций.

## 02. TI Broadcast

Палитра:

- Broadcast paper `#F1F0E9`
- News ink `#111111`
- Live vermilion `#F04432`
- Signal cobalt `#2049D8`
- Screen blue `#C9D7FF`

Типографика: Oswald, IBM Plex Sans, IBM Plex Mono.

Композиция:

```text
[COUNTER/PICK]       [LIVE] [3—3]
[DRAFT DESK | full-bleed hero cut]
[live ticker: patch · freshness · rank]
[opponents 3/5]
[SCAN DRAFT            ][MANUAL]
[last draft / continue →]
[01 draft] [02 history] [03 profile]
```

Сигнатура — мобильная турнирная трансляция с крупным hero cut и lower thirds. У интерфейса нет стандартных floating cards.

Масштабирование:

- result превращается в «hero of the draft»;
- причины и риски — в broadcast lower thirds;
- history — в сетку прошлых матчей;
- Pro — в сезонный pass, не в generic pricing cards.

## 03. Coach Notebook

Палитра:

- Field paper `#EEE5CB`
- Coach ink `#17324A`
- Red pencil `#BF3E33`
- Marker yellow `#EAD35B`
- Clean sheet `#FAF7EB`

Типографика: Newsreader, DM Sans, Caveat только для коротких заметок.

Композиция:

```text
[CP / личный разбор]            [3 из 3]
┌──────────── лист плана ────────────┐
│ НЕ УГАДЫВАЙ. РАЗБЕРИ СОСТАВ.       │
│ [POS 2] [ANCIENT V]          править│
│ [pudge][axe][disruptor][+][+]       │
│       заметка тренера ↗             │
│ [       разобрать драфт       ]     │
└─────────────────────────────────────┘
[из прошлого разбора →]
[драфт] [разборы] [профиль]
```

Сигнатура — личный разбор на физическом листе. Неровность используется только в декоративном слое; данные и controls остаются строгими.

Масштабирование:

- result — страница с подчёркнутыми причинами;
- risk — красная пометка на полях;
- history — стопка разборов;
- profile — титульный лист игрового профиля.

## 04. Ancient Relic

Палитра:

- Obsidian `#080B09`
- Aged copper `#A97943`
- Emerald signal `#5CCFA0`
- Relic bone `#E3D7BC`
- Deep moss `#24372F`

Типографика: Cinzel, Manrope, JetBrains Mono.

Композиция:

```text
[Draft Oracle / Counterpick]        [3]
          [patch · updated]
     ПРОБУДИ ИДЕАЛЬНЫЙ ПИК
       [five enemy sockets]
      ╭── ten-slot seal ──╮
      │   AWAKEN DRAFT    │
      ╰───────────────────╯
[POS II · MID] ◇ [ANCIENT V]
[manual seal →]
[draft] [chronicles] [profile]
```

Сигнатура — круглая печать драфта. Motion должен срабатывать один раз при запуске анализа; постоянные частицы и glow не нужны.

Масштабирование:

- photo review — настройка печати;
- analysis — короткое пробуждение рун;
- result — три раскрытых артефакта-кандидата;
- история — хроники, но с обычной доступной навигацией.

## 05. Kinetic Arena

Палитра:

- Deep plum `#2D0A42`
- Acid lime `#CAFF4B`
- Coral hit `#FF6A5C`
- Arena cobalt `#2B52FF`
- Poster cream `#FFF6DF`

Типографика: Bricolage Grotesque, Space Mono.

Композиция:

```text
[CP]               [LIVE 7.41d] [3/3]
DRAFT!                       [POS 2]
НЕ ГАДАЙ — СОБЕРИ ОТВЕТ.
       [asymmetric hero wheel]
[meta signal]
[   SCAN DRAFT   ][MANUAL]
[draft] [history] [me]
```

Сигнатура — screenprint hero wheel и огромный CTA в зоне большого пальца. Выразительность сосредоточена в hero wheel и главном действии, а не размазана по каждому элементу.

Масштабирование:

- recommendations получают разный визуальный вес вместо трёх одинаковых cards;
- explanation открывается bottom sheet;
- history становится постерной лентой;
- profile использует спортивные stickers и сохранённый hero pool.

## Общие рамки следующего этапа

- Главные touch targets: минимум 44 pt на iOS и 48 dp на Android.
- Цвет Radiant/Dire всегда дублируется подписью, формой или иконкой.
- Reduce Motion отключает ticker, pulse и shape morph.
- Hero portrait может быть маленьким визуально, но tappable area остаётся крупной.
- Текущий React Native-клиент не обязан сохранять прежнюю иерархию, однако рабочие сценарии камеры, ручного ввода, квоты, offline и валидации должны сохраниться.
- Выбранное направление сначала превращается в токены и общие primitives, затем применяется ко всем экранам, чтобы не получить эффект «красивая главная + старое приложение внутри».

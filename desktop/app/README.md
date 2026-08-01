# Counterpick Desktop

Desktop-компаньон Dota Picker на Electron, React и TypeScript. Приложение подключается к Dota 2 через официальный Game State Integration, локально снимает только окно игры и отправляет изменившийся кадр на API для распознавания и расчёта контрпиков.

## Запуск

Требования: Node.js 22.22 или новее, npm 10 или новее.

```powershell
npm install
npm run dev
```

Production-проверка:

```powershell
npm run build
npm run package
```

`npm run package` создаёт распакованное приложение, а `npm run dist` — установщик.

## API

По умолчанию используется Render:

```text
https://dota-picker-api.onrender.com/v1
```

Для локального backend скопируйте `.env.example` в `.env.local` и задайте:

```text
MAIN_VITE_API_URL=http://127.0.0.1:3000/v1
```

HTTP разрешён только для localhost. Для удалённого API требуется HTTPS.

## Автоматический помощник

При первом включении приложение запрашивает согласие на захват окна Dota 2. Затем оно:

1. Находит Steam и устанавливает `gamestate_integration_counterpick.cfg`.
2. Поднимает локальный GSI receiver только на `127.0.0.1:32123`.
3. Ждёт `HERO_SELECTION` или `STRATEGY_TIME`.
4. Захватывает окно Dota 2 через системный `desktopCapturer`.
5. Пропускает неизменившиеся кадры и ограничивает запросы до трёх в минуту.
6. После результата продолжает дешёвое наблюдение и пересчитывает рекомендации только при новых пиках.

Для надёжного захвата рекомендуется режим Dota 2 «Окно без рамки». Приложение не читает память процесса, не внедряется в игру и не захватывает весь рабочий стол.

Перед запуском Dota 2 добавьте в Steam → Dota 2 → Свойства → Параметры запуска:

```text
-gamestateintegration
```

Если система зарегистрировала `PageUp`, во время драфта эта клавиша показывает и скрывает overlay. Если клавиша недоступна, в меню трея появится пометка `PageUp недоступен`; там же остаётся команда показа и скрытия overlay. В overlay можно выбрать позицию 1–5 и вручную проверить новые пики кнопкой обновления. После смены позиции текущий драфт пересчитывается для выбранной роли.

## Безопасность

- Renderer работает без Node.js, с `contextIsolation`, sandbox и узким typed bridge.
- IPC принимает сообщения только от main frame текущего окна и валидирует входные данные через Zod.
- Access token хранится только в памяти main process.
- Refresh token шифруется средствами операционной системы через Electron `safeStorage`.
- Внешняя навигация, popup-окна и permissions renderer отключены.
- Разрешены только проверенные HTTPS- и mailto-ссылки.

## Структура

```text
src/main       Electron lifecycle, API, GSI, capture engine, secure storage
src/preload    Narrow contextBridge
src/shared     Contracts, validation and IPC channel names
src/renderer   React interface
```

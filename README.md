# Counterpick

Мобильный Dota draft assistant: пользователь фотографирует экран драфта или выбирает героев вручную, а приложение предлагает контрпики с учётом позиции, ранга и актуальных данных OpenDota. Регистрация необязательна: гостевой режим, бесплатная квота, история и переход на Pro уже заложены в клиент и API.

## Что находится в проекте

- `client` — Expo SDK 54 / React Native 0.81 / React 19 приложение для iOS, Android и web
- `server` — Fastify 5 / PostgreSQL 18 / Drizzle API
- `admin` — Vite / React административная панель с демо-данными
- `design-preview` — сохранённые дизайн-концепты и интерактивные прототипы

Подробные команды и переменные окружения находятся в `client/README.md` и `server/README.md`. Секреты хранятся только в локальных `.env`; в репозиторий добавляются исключительно `.env.example`.

## Актуальный интерфейс

- светлая тема включена по умолчанию, тёмная выбирается в профиле и сохраняется локально;
- главный сценарий построен вокруг крупной карточки сканирования драфта, а ручной выбор остаётся рядом как второй путь;
- современная типографика Manrope, компактные подписи, иконки и плавные анимации без тяжёлого фэнтезийного декора;
- отдельная навигация для платформ: glass-эффект на iOS и кастомный Dota-inspired tab bar на Android;
- основная иконка и splash используют `client/assets/brand/app-icon-modern-v4.png`;
- авторская иллюстрация сканирования находится в `client/assets/brand/draft-scan-hero-light.jpg`.

## Быстрый web-запуск на Windows

Нативная сборка для первого просмотра не нужна. В PowerShell:

```powershell
Set-Location C:\Users\Bogdan\Desktop\Frontend\dota-picker\client
Copy-Item .env.example .env
npm install
npm run web
```

Expo откроет web-версию, обычно на `http://localhost:8081`. Если браузер не открылся автоматически, адрес можно открыть вручную. Для запуска общего dev-меню используйте `npm run start`, затем клавишу `w`.

Без запущенного API клиент открывается и сохраняет локальный драфт; сетевые данные, авторизация, серверная история, распознавание фото и свежий анализ требуют backend.

## Требования backend

Для локального API нужны:

1. Node.js 24 LTS и npm.
2. PostgreSQL 18 либо Docker Desktop с Compose.
3. `.env` в папке `server`, созданный из `.env.example`.
4. Доступ к `https://api.opendota.com` для каталога, меты и matchup-статистики.
5. `GEMINI_API_KEY` только для распознавания героев по фото.
6. RevenueCat, App Store и Google Play только для проверки реальных покупок Pro.

Минимальный локальный запуск API в отдельном PowerShell:

```powershell
Set-Location C:\Users\Bogdan\Desktop\Frontend\dota-picker\server
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

API будет доступен на `http://localhost:4000`, Swagger UI — на `http://localhost:4000/docs`. Для web-клиента значение `EXPO_PUBLIC_API_URL=http://localhost:4000/v1` подходит без изменений. На физическом телефоне вместо `localhost` нужен LAN-адрес компьютера или публичный HTTPS URL.

Проект не требует Redis или Kafka на текущем объёме: PostgreSQL закрывает аккаунты, квоты, историю, идемпотентность и кеш меты. Добавлять отдельную очередь или распределённый кеш имеет смысл только после появления подтверждённой нагрузки.

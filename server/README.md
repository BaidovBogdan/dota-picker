# Dota Picker API

Backend мобильного Dota Picker: гостевой вход без обязательной регистрации, email/password-аккаунты, лимиты попыток, подбор контрпиков по актуальной статистике OpenDota, распознавание драфта по изображению, история и минимальная интеграция RevenueCat.

## Стек

- Node.js 24 LTS, Fastify 5, TypeScript strict
- Zod 4 и `fastify-type-provider-zod`
- PostgreSQL 18, Drizzle ORM и SQL-миграции
- JWT access tokens, ротируемые opaque refresh tokens, Argon2id
- Gemini API, мультимодальный `inlineData`, JSON Schema и повторная проверка через Zod
- Swagger/OpenAPI, Helmet, CORS, rate limiting, Pino
- Vitest и ESLint

## Локальная подготовка на Windows

Требования:

- Node.js 24 LTS и npm;
- PostgreSQL 18+ либо Docker Desktop с Compose;
- свободные локальные порты `4000` для API и `5432` для PostgreSQL;
- доступ к `https://api.opendota.com` для каталога, меты и matchup-статистики.

В PowerShell из папки `server`:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev
```

`docker compose` поднимает только PostgreSQL; API запускается отдельной командой `npm run dev`. Если локальный PostgreSQL уже установлен, Docker не нужен: создайте базу и укажите её адрес в `DATABASE_URL`.

Для старта обязательны корректные `DATABASE_URL`, `JWT_SECRET` длиной не меньше 32 символов и `REVENUECAT_WEBHOOK_SECRET` длиной не меньше 24 символов. Значения из `.env.example` подходят только для локальной разработки. `GEMINI_API_KEY` можно оставить пустым, если распознавание фото пока не тестируется. RevenueCat app IDs и store-настройки нужны только для реальных покупок.

После запуска API доступен на `http://localhost:4000`, Swagger UI — на `http://localhost:4000/docs`, readiness — на `http://localhost:4000/health/ready`. Миграции при старте сервера автоматически не применяются.

Проверки выполняются отдельно:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## API

Base URL: `/v1`. Все пользовательские маршруты, кроме auth, требуют `Authorization: Bearer <accessToken>`.

| Метод | Маршрут | Назначение |
|---|---|---|
| POST | `/v1/auth/guest` | Создать или восстановить гостя по `deviceId` |
| POST | `/v1/auth/register` | Создать email/password аккаунт |
| POST | `/v1/auth/login` | Войти |
| POST | `/v1/auth/upgrade-guest` | Превратить текущего гостя в аккаунт без потери данных |
| POST | `/v1/auth/refresh` | Ротировать refresh token |
| POST | `/v1/auth/logout` | Отозвать refresh token |
| GET | `/v1/me` | Профиль и текущая квота |
| DELETE | `/v1/me` | Удалить гостя или аккаунт и связанные серверные данные |
| GET | `/v1/quota` | Остаток попыток |
| GET | `/v1/heroes?rank=1` | Каталог героев и мета для ранга 1–8 |
| GET | `/v1/heroes/meta` | Текущий патч и свежесть данных |
| POST | `/v1/analyses/manual` | Подобрать три героя по подтверждённому драфту |
| POST | `/v1/analyses/photo/recognize` | Распознать фото драфта |
| GET | `/v1/analyses/history` | История с cursor pagination |
| GET | `/v1/analyses/history/:id` | Один сохранённый результат |
| GET | `/v1/billing/status` | Entitlement, срок Pro и квота |
| POST | `/v1/billing/webhooks/revenuecat` | Закрытый webhook RevenueCat |
| GET | `/health/live` | Liveness |
| GET | `/health/ready` | Readiness с проверкой PostgreSQL |

Для `POST /v1/analyses/manual` и `POST /v1/analyses/photo/recognize` обязателен уникальный заголовок `Idempotency-Key` длиной 8–128 символов. Повтор завершённого запроса с тем же телом возвращает сохранённый ответ. Повтор того же ключа с другим телом отклоняется. Незавершённая операция удерживает короткую lease, длительность которой задаётся `IDEMPOTENCY_LEASE_SECONDS`. После её истечения повторный запрос может продолжить связанный анализ или восстановить уже сохранённый ответ; уникальные события квоты не допускают повторного списания.

### Ручной анализ

```json
{
  "source": "manual",
  "position": 3,
  "allyHeroIds": [1, 5],
  "enemyHeroIds": [2, 14, 26],
  "rank": 5
}
```

`source` можно установить в `photo`, если пользователь подтвердил распознанный драфт. Попытка резервируется атомарно и возвращается при любой ошибке до успешного результата. Ответ содержит три рекомендации, итоговый score, confidence, отдельные метрики и reason codes для локализации на клиенте.

### Фото

Фото отправляется как `multipart/form-data`, поле `image`. Разрешены JPEG, PNG и WEBP. Максимальный размер задаётся `MAX_IMAGE_BYTES`, по умолчанию 5 MiB. Файл не сохраняется: он находится в памяти только на время запроса и передаётся в Gemini API как base64 `inlineData`. Распознавание доступно только при ненулевой квоте, ограничено тарифным лимитом, rate limit `3/min` по ID аутентифицированного аккаунта и дополнительным IP-лимитом `12/min`.

Rate limit хранится в памяти процесса и корректен для одной реплики API. Перед горизонтальным масштабированием нужно подключить общий store, например Redis, к `@fastify/rate-limit`; иначе каждая реплика будет считать лимит отдельно.

Ответ содержит распознанную сторону, слот, героя, confidence и `needsReview`. Клиент должен показать экран подтверждения и только после него отправить драфт в `/v1/analyses/manual` с `source: "photo"`.

## Рекомендации и мета

Ranking выполняется детерминированным серверным движком, а не языковой моделью. Он учитывает соответствие позиции, win rate выбранного rank bracket, накопленную выборку матчей против каждого противника и базовый баланс состава. Matchup-данные OpenDota являются rolling-агрегацией и не выдаются за статистику только текущего патча; версия клиента отображается рядом как контекст. OpenDota-запросы кэшируются; после истечения свежего TTL сервер пытается обновить данные, а при временной ошибке может вернуть последний результат в пределах stale TTL. Если пригодных кэшированных данных нет, API честно отвечает `503`.

## Квота

По умолчанию Free получает 3 попытки и восстанавливает 1 раз в 24 часа. Pro получает максимум 100 и суточное пополнение до 100. Значения полностью настраиваются через env. Квота изменяется внутри транзакции с блокировкой аккаунта, поэтому параллельные запросы не могут потратить одну попытку дважды.

## RevenueCat

Клиент должен идентифицироваться в RevenueCat значением `account.revenueCatAppUserId`, которое равно UUID аккаунта. Webhook настраивается на `/v1/billing/webhooks/revenuecat`, а в Authorization header передаётся секрет из `REVENUECAT_WEBHOOK_SECRET`. `REVENUECAT_PRO_ENTITLEMENT_ID` задаёт entitlement Pro.

Каждый webhook сохраняется по уникальному RevenueCat event ID. Успешно применённое событие не меняет подписку второй раз, а временно неприменимое остаётся в состоянии `pending` и получает `503`, чтобы RevenueCat повторил доставку. Более старые lifecycle-события не перезаписывают новое состояние. Активное entitlement переводит аккаунт на Pro и пополняет квоту; `EXPIRATION` или refund возвращает Free и ограничивает остаток Free-лимитом. `SUBSCRIPTION_PAUSED` сохраняет доступ до фактического истечения периода, а `TRANSFER` переносит активный серверный тариф между известными аккаунтами и сохранёнными tombstone. Поэтому `TRANSFER`, пришедший раньше purchase webhook, безопасно доигрывается после его получения. Если все автоматические повторы RevenueCat исчерпаны, pending event нужно повторно отправить из dashboard; перед production-нагрузкой стоит добавить фоновую reconciliation-задачу с RevenueCat REST credentials. `REVENUECAT_APP_IDS` ограничивает допустимые приложения, а `REVENUECAT_ALLOW_SANDBOX` должен быть выключен в production. Реальные App Store, Google Play и RevenueCat public SDK keys в репозитории отсутствуют.

## Обязательные внешние настройки

- `DATABASE_URL`
- `JWT_SECRET` не короче 32 символов
- `REVENUECAT_WEBHOOK_SECRET` не короче 24 символов
- `REVENUECAT_APP_IDS` со списком разрешённых RevenueCat app IDs для production
- `REVENUECAT_ALLOW_SANDBOX=false` для production
- `GEMINI_API_KEY` для распознавания фото
- доступ к `https://api.opendota.com`

Модель фото задаётся `GEMINI_VISION_MODEL`. Значение по умолчанию — стабильная мультимодальная `gemini-3.5-flash-lite`. Таймаут задаётся через `GEMINI_TIMEOUT_MS`. Ответ модели ограничен JSON Schema и повторно проверяется Zod перед использованием.

## Ошибки

Все ошибки имеют единый формат:

```json
{
  "error": {
    "code": "QUOTA_EXHAUSTED",
    "message": "No analysis attempts remaining",
    "details": {},
    "requestId": "req-1"
  }
}
```

Исходные изображения, refresh tokens и пароли не логируются. Refresh tokens хранятся только в виде SHA-256 hash, пароли — Argon2id hash.

При upgrade гостя все старые refresh tokens атомарно отзываются, а версия access token увеличивается. Обнаружение повторного использования уже ротированного refresh token отзывает всю его token family и также инвалидирует активные access tokens.

Удаление через `DELETE /v1/me` каскадно удаляет email, password hash, историю, refresh tokens, события квоты и idempotency records. Для любого удалённого аккаунта временно остаётся privacy-minimal billing tombstone: исходный UUID не хранится, вместо него записывается HMAC. Для Free это только hash и retention-метаданные; для активного Pro дополнительно сохраняются продукт, срок и остаток квоты. Tombstone позволяет принять запоздавший purchase webhook и затем перенести уже оплаченное право на новую сессию. Он очищается после окончания retention, а entitlement-данные обнуляются после переноса. Удаление аккаунта не отменяет подписку в App Store или Google Play, поэтому клиент отдельно предупреждает пользователя и даёт открыть системное управление подпиской.

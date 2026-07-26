# Counterpick mobile

Expo-приложение для быстрого выбора контрпика под видимый Dota-драфт. Пользователь может сфотографировать экран или собрать союзников и противников вручную. Регистрация необязательна: при первом открытии создаётся гостевая сессия, а аккаунт нужен для синхронизации и Pro.

## Интерфейс

Текущий UI — лёгкий продуктовый дизайн с Dota-акцентами через цвета команд, портреты героев и иллюстрацию поля:

- светлая тема используется по умолчанию;
- тёмная тема переключается в профиле и сохраняется между запусками;
- крупная карточка «Выбрать фото» — главный action первого экрана;
- ручной драфт, позиция и ранг доступны без лишних промежуточных экранов;
- Manrope используется как основной шрифт, JetBrains Mono — для числовых и технических данных;
- Reanimated, Gesture Handler и platform haptics отвечают за короткие transform/opacity-анимации;
- Reduce Motion отключает необязательное движение;
- iOS использует плавающую навигацию с blur, Android — кастомный Dota-inspired tab bar;
- контент учитывает safe area, крупные touch targets и ограничение ширины на web/tablet.

Активные бренд-ассеты:

- `assets/brand/app-icon-modern-v4.png` — иконка приложения, adaptive icon и splash mark;
- `assets/brand/draft-scan-hero-light.jpg` — иллюстрация главной карточки сканирования.

## Стек

- Expo SDK 54, React Native 0.81, React 19, TypeScript strict
- Expo Router 6 и React Navigation
- NativeWind 4 / Tailwind CSS 3
- Reanimated 4 и Gesture Handler
- TanStack Query 5 для server state и кеширования
- Zustand 5 + AsyncStorage для темы, драфта, квоты и локальной истории
- React Hook Form + Zod для форм и runtime-проверки API DTO
- Expo Image, Image Picker, Image Manipulator, Haptics, Blur и Linear Gradient
- FlashList 2 для каталога героев и истории
- RevenueCat через изолированный billing adapter

## Переменные окружения

Создайте `.env` на основе `.env.example`:

```env
EXPO_PUBLIC_API_URL=http://localhost:4000/v1
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

Для web на том же компьютере оставьте `localhost`. На iPhone, Android-телефоне или удалённом эмуляторе укажите LAN-адрес компьютера, например `http://192.168.1.10:4000/v1`, либо публичный HTTPS URL.

Production EAS build прерывается, если не заданы API URL и оба RevenueCat public SDK key. Это защищает store-сборку от случайного подключения к `localhost`.

## Локальный web-запуск на Windows

Нативная сборка, Xcode и Android Studio для web-просмотра не нужны. В PowerShell:

```powershell
Set-Location C:\Users\Bogdan\Desktop\Frontend\dota-picker\client
Copy-Item .env.example .env
npm install
npm run web
```

Обычно Expo поднимает приложение на `http://localhost:8081`. Если вкладка не открылась автоматически, откройте этот адрес вручную.

Альтернативный общий dev-режим:

```powershell
npm run start
```

После старта нажмите:

- `w` — web;
- `a` — Android Expo Go или эмулятор;
- отсканируйте QR-код камерой iPhone — iOS Expo Go.

`npm run android` также запускает dev-режим Expo Go и не собирает APK. `npm run native:android` и `npm run native:ios` предназначены для development build и для первого web-теста не нужны. iOS development build можно собрать через EAS с Windows, но установка на физический iPhone требует Apple Developer Program.

## Что работает без backend

Клиент откроется и без API: тема, навигация, ручной драфт и локальная история сохраняются на устройстве. При недоступном сервере ручной анализ может вернуть явно помеченный базовый offline-результат.

Для следующих функций нужен запущенный `server`:

- гостевая серверная сессия и email/password auth;
- свежий каталог, патч и matchup-данные OpenDota;
- серверные рекомендации и синхронизированная история;
- квота Free/Pro;
- распознавание фото через Gemini;
- подтверждение покупок через RevenueCat.

Полная подготовка API описана в `../server/README.md`.

## Хранение и приватность

Access/refresh tokens и guest credential меняются через единый auth coordinator. На iOS/Android секреты хранятся в Secure Store, в локальном web-режиме — в `localStorage`. Запоздавший запрос старой сессии не может перезаписать токены или квоту нового аккаунта.

Фото уменьшается на устройстве до 1600 px по длинной стороне и JPEG quality 0.78, затем отправляется multipart без base64. URI фото не попадает в persisted store. Временный JPEG удаляется после выхода из review-экрана и не сохраняется в истории.

## Проверки без запуска приложения

```powershell
npm run doctor
npm run typecheck
npm run lint
npm run format:check
```

## Expo Go и покупки

SDK 54 закреплён для совместимости с соответствующим runtime Expo Go. Если установленный Expo Go не принимает runtime проекта, web и Android dev-режим остаются доступными, а для iOS потребуется совместимая версия Expo Go либо development build.

Реальные покупки отключены в Expo Go и web. Для них нужен development build (`eas build --profile development`), RevenueCat offering с monthly/annual packages и entitlement, совпадающий с `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` и серверным `REVENUECAT_PRO_ENTITLEMENT_ID`.

## Перед релизом

- production API URL с HTTPS;
- реальные RevenueCat keys, products, offering и webhook;
- Apple/Google signing, privacy manifests и store metadata;
- проверка прав на маркетинговое использование названия Dota и игровых изображений Valve;
- device QA на нескольких версиях iOS, Android API и размерах экранов.

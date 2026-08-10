# Выпуск Counterpick Desktop

Исходный код и Windows-релизы публикуются в публичном репозитории `BaidovBogdan/dota-picker`. Приложение читает update metadata и установщик из GitHub Releases этого же репозитория.

## Однократная настройка

1. Оставьте `BaidovBogdan/dota-picker` публичным и разрешите workflow `Desktop Release` право `Contents: write`.
2. Сохраните секрет `COUNTERPICK_RELEASES_TOKEN` до успешной публикации `0.1.18`: только этот переходный релиз зеркалируется в прежний `BaidovBogdan/counterpick-releases`.
3. После успешного переходного релиза старый репозиторий можно архивировать, но нельзя удалять его релиз `0.1.18`: установленные версии до `0.1.18` получают обновление через него.

Для production включите ruleset, ограничивающий создание тегов `v*`, и immutable releases в `dota-picker`. Если над исходниками будут работать другие участники, защитите release workflow через GitHub Environment с ручным approval.

GitHub Releases в `dota-picker` зарезервированы для стабильных desktop-релизов Counterpick. Не публикуйте backend или другие компоненты как отдельный stable latest release без desktop `latest.yml`: electron-updater читает общий `/releases/latest` этого репозитория. Backend продолжает развёртываться из исходного кода и не требует GitHub Release.

Встроенного release-токена в приложении и установщике нет. Основной релиз использует ограниченный `GITHUB_TOKEN`; старый fine-grained token нужен только для однократного зеркала `0.1.18`.

## Текущий подготовленный релиз

В `desktop/app/package.json` и `package-lock.json` указана версия `0.1.18`. Локальная Windows-сборка выполняет typecheck, тесты, production build, проверку packaging-контракта, NSIS-сборку и проверку готовых артефактов:

```powershell
cd desktop/app
npm ci
npm run dist:win
```

Для `0.1.18` ожидаются:

- `release/Counterpick-0.1.18-x64.exe`
- `release/Counterpick-0.1.18-x64.exe.blockmap`
- `release/latest.yml`
- `release/win-unpacked/` с Electron-локалями только `en-US.pak` и `ru.pak`

`npm run verify:dist` повторно проверяет совпадение версии и имён, SHA-512 в `latest.yml`, ненулевые артефакты, структуру `app.asar` и точный набор локалей.

## Следующее обновление

Каждый релиз обязан иметь новую версию. Для patch-релиза:

```powershell
cd desktop/app
npm version patch --no-git-tag-version
cd ../..
$desktopVersion = (Get-Content desktop/app/package.json -Raw | ConvertFrom-Json).version
git add desktop/app/package.json desktop/app/package-lock.json
git commit -m "release: desktop v$desktopVersion"
git tag "v$desktopVersion"
git push origin main
git push origin "v$desktopVersion"
```

Тег и версия в `package.json` должны совпадать. После публикации установленный Counterpick сам проверит GitHub Release, покажет плитку над настройками и профилем и начнёт скачивание только после подтверждения пользователя.

Не перезаписывайте уже опубликованный успешный тег и не заменяйте файлы существующей версии. Если публикация оборвалась, сначала проверьте public release-репозиторий: незавершённый draft и созданный для него тег можно удалить, после чего безопасно перезапустить workflow. Если релиз уже был опубликован, исправьте причину и выпустите следующую версию.

## Что отправлять другому человеку

Передайте только файл `Counterpick-<version>-x64.exe`. Это обычный Windows-установщик. Файлы `.blockmap` и `latest.yml` нужны механизму автообновления на GitHub и вручную пользователю не отправляются.

При новой интерактивной установке NSIS может предложить базовую платформу Overwolf только отдельным, изначально выключенным checkbox. Загрузка идёт с точного официального HTTPS endpoint, бинарник запускается только после валидной Authenticode-подписи разрешённого издателя и всегда открывает собственный интерактивный установщик Overwolf. Silent-установка Counterpick и автообновление этот flow не запускают. Базовая платформа не содержит Counterpick Live: companion пока не опубликован в Overwolf Appstore, поэтому не обещайте пользователю готовый Live-режим до одобрения listing/installer.

Пока приложение не подписано, Windows SmartScreen может показать предупреждение о неизвестном издателе. Для личного тестирования это ожидаемо; перед публичным распространением установщик и приложение нужно подписать.

## Проверка диагностики перед релизом

1. На чистом профиле убедитесь, что удалённая диагностика выключена, а локальный лог создаётся независимо от согласия.
2. Проверьте раздельные файлы `main.log`, `development.log` и `test.log`; создание `UpdateManager` не должно менять лимит ротации 5 МиБ или путь.
3. Авторизуйтесь, включите диагностику и воспроизведите драфт. В Admin → Diagnostics должны появиться только структурированные события этой учётной записи; `recognition_result` и `overlay_state.visibleSlots` должны объяснять, какие герои распознаны и какие реально показаны.
4. Отключите согласие и убедитесь, что будущие события не отправляются, а неотправленная очередь удалена. Локальный лог должен продолжить работу.
5. Выйдите из аккаунта и войдите под другим в том же Windows-профиле. Очередь первого аккаунта не должна отправиться от имени второго.
6. Проверьте disclosure на русском и английском: срок хранения 30 дней и полный список разрешённых полей указаны явно; screenshots, image bytes, raw GSI, player names, Steam IDs, tokens, paths, error messages и stacks исключены.

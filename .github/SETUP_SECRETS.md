# GitHub Actions Secrets Setup

Для работы smoke-тестов в GitHub Actions необходимо настроить secrets.

## Требуемые Secrets

1. **ADMIN_USERNAME** - логин администратора для тестов
   - Значение: `AlexeyFrolov`

2. **ADMIN_PASSWORD** - пароль администратора
   - Значение: `1234Fgtn@`

## Как добавить secrets

### Через веб-интерфейс GitHub:

1. Перейдите в репозиторий: https://github.com/marsiandeployer/TELEWIN
2. Откройте **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **New repository secret**
4. Добавьте каждый secret:
   - Name: `ADMIN_USERNAME`
   - Secret: `AlexeyFrolov`

   - Name: `ADMIN_PASSWORD`
   - Secret: `1234Fgtn@`

### Через GitHub CLI:

```bash
gh secret set ADMIN_USERNAME --body "AlexeyFrolov"
gh secret set ADMIN_PASSWORD --body "1234Fgtn@"
```

## Проверка

После настройки secrets:
1. Сделайте коммит в любую ветку
2. Проверьте запуск workflow: **Actions** → **TeleWin CI**
3. Убедитесь что job **Puppeteer smoke tests** успешно выполнился

## Что делают тесты в CI

1. Устанавливают Node.js 20
2. Устанавливают зависимости (`npm ci`)
3. Запускают user smoke tests (без авторизации)
4. Запускают admin smoke tests (с учетными данными из secrets)
5. При ошибках загружают скриншоты и отчеты как artifacts

## Artifacts

Если тесты упали, скриншоты и отчеты можно скачать:
- **Actions** → выбрать run → **Artifacts** → скачать `smoke-test-screenshots`

## Безопасность

⚠️ **ВАЖНО**: Используйте тестовые учетные данные, не production!

Текущие креды для staging окружения `https://telewin.wpmix.net`.

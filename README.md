# Telegram Bot for Work Shifts Management

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

Телеграм‑бот для управления группой и учета рабочего времени на NestJS + Telegraf. 
Использует PostgreSQL (Sequelize) и Redis (сессии Telegraf).

### Основные возможности:
- 🤖 Автоматическое приветствие и верификация новых участников
- 👥 Синхронизация участников группы через MTProto API
- 👔 Система ролей (Сотрудник, Менеджер, Управляющий)
- 📊 Автоматический опрос смены каждый день в 20:00
- ⏱ Учет рабочего времени и выданных товаров
- 🔒 Антиспам и защита от инвайт-ссылок
- 🛡 Интеграция с правами администраторов группы

## Установка

```bash
npm install --legacy-peer-deps
```

## Запуск

```bash
# development (watch)
npm run start:dev

# production
npm run build:prod
npm run start:prod
```

Поддерживаются профили окружения: `NODE_ENV=development|production`.
Загрузка переменных: сначала `.env.<NODE_ENV>`, затем fallback на `.env`.

## Переменные окружения (.env)

```env
# Telegram Bot
BOT_TOKEN=

# PostgreSQL
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=
DATABASE_DATABASE=tbot

# Redis (Telegraf session)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DATABASE=0
BOT_SESSION_PREFIX=tsess

# MTProto (optional, for full member sync)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION=

# Scheduler
TIMEZONE=Asia/Novosibirsk  # UTC+7 (см. TIMEZONES_UTC+7.md для других вариантов)
```

### Доступные часовые пояса UTC+7:
- `Asia/Novosibirsk` — Новосибирск, Кемерово, Томск
- `Asia/Krasnoyarsk` — Красноярск
- `Asia/Bangkok` — Бангкок, Таиланд
- `Asia/Ho_Chi_Minh` — Хошимин, Вьетнам
- `Asia/Jakarta` — Джакарта, Индонезия

Полный список см. в файле `TIMEZONES_UTC+7.md`

Валидация `.env` — через Joi в `ConfigModule`.

## Тесты

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Отправка на GitHub

1. Создайте новый репозиторий на [GitHub](https://github.com/new)
2. Добавьте remote:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   ```
3. Отправьте код:
   ```bash
   git push -u origin master
   ```

## Лицензия

[MIT](LICENSE)

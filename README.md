<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Описание

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

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

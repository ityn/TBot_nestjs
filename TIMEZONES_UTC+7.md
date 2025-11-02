# Доступные часовые пояса для UTC+7

Для переменной `TIMEZONE` в `.env` файле вы можете использовать следующие значения:

## Основные часовые пояса UTC+7:

### Россия
- `Asia/Novosibirsk` — Новосибирск, Кемерово, Томск
- `Asia/Krasnoyarsk` — Красноярск (UTC+7)
- `Asia/Novokuznetsk` — Новокузнецк
- `Asia/Barnaul` — Барнаул

### Другие страны
- `Asia/Bangkok` — Бангкок, Таиланд
- `Asia/Ho_Chi_Minh` — Хошимин, Вьетнам
- `Asia/Jakarta` — Джакарта, Индонезия (западная часть)
- `Asia/Phnom_Penh` — Пномпень, Камбоджа
- `Asia/Vientiane` — Вьентьян, Лаос
- `Indian/Christmas` — Остров Рождества

## Примеры использования в .env:

```bash
# Для Новосибирска и окрестностей
TIMEZONE=Asia/Novosibirsk

# Для Красноярска
TIMEZONE=Asia/Krasnoyarsk

# Для Бангкока (Таиланд)
TIMEZONE=Asia/Bangkok

# Для Вьетнама
TIMEZONE=Asia/Ho_Chi_Minh
```

## Проверка текущего времени

После настройки часового пояса, опрос будет отправляться каждый день в **20:00** по выбранному часовому поясу.

## Важно

- Используйте **точное** название часового пояса из списка выше
- Регистр букв имеет значение: `Asia/Novosibirsk` ✅, `asia/novosibirsk` ❌
- По умолчанию используется `Asia/Novosibirsk` (UTC+7)

## Как изменить:

1. Откройте `.env.development` или `.env` файл
2. Добавьте или измените строку:
   ```
   TIMEZONE=Asia/Novosibirsk
   ```
3. Перезапустите бота

## Для других часовых поясов

Если вам нужен другой часовой пояс (не UTC+7), вы можете использовать:

- **UTC+3 (Москва)**: `Europe/Moscow`
- **UTC+5 (Екатеринбург)**: `Asia/Yekaterinburg`
- **UTC+6 (Омск)**: `Asia/Omsk`
- **UTC+8 (Иркутск)**: `Asia/Irkutsk`
- **UTC+9 (Якутск)**: `Asia/Yakutsk`
- **UTC+10 (Владивосток)**: `Asia/Vladivostok`

Полный список: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones



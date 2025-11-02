# Инструкция по публикации проекта на GitHub

## Шаги для публикации:

1. **Создайте репозиторий на GitHub:**
   - Перейдите на https://github.com/new
   - Введите имя репозитория (например, `TBot_nestjs`)
   - Добавьте описание (опционально)
   - Выберите Public или Private
   - НЕ добавляйте файлы (README, .gitignore и т.д.) - они уже есть
   - Нажмите "Create repository"

2. **Добавьте remote и отправьте код:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin master
   ```

3. **Готово!** Ваш код опубликован на GitHub.

## Альтернативный способ через GitHub CLI:

Если у вас установлен GitHub CLI (`gh`):

```bash
gh repo create TBot_nestjs --public --source=. --remote=origin --push
```

## После публикации:

- Убедитесь, что файл `.env` и другие секретные данные в `.gitignore`
- Проверьте, что все файлы корректно отображаются на GitHub
- Добавьте описание проекта, если необходимо
- Настройте GitHub Actions для CI/CD (опционально)


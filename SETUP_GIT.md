# Інструкція з викладення проєкту на GitHub

## Крок 1: Створіть .env.example файли вручну

### bot/.env.example
```env
# Telegram Bot Token (отримайте в @BotFather)
TOKEN=your_telegram_bot_token_here

# Список ID адміністраторів (формат: [123456789,987654321])
ADMINISTRATORS=[123456789]
```

### app/.env.example
```env
# Database URL (SQLite)
DATABASE_URL="file:../database/ayn_marketplace.db"

# Telegram Bot URL для поділів
NEXT_PUBLIC_BOT_URL=https://t.me/your_bot
```

## Крок 2: Ініціалізуйте Git репозиторій

```bash
cd /Users/nowayrm/Desktop/Projects/TeleBots/In\ Progress/AllYouNeed

# Ініціалізуйте git
git init

# Додайте всі файли
git add .

# Зробіть перший коміт
git commit -m "Initial commit: All You Need Marketplace"
```

## Крок 3: Підключіть до GitHub

```bash
# Додайте remote репозиторій
git remote add origin https://github.com/romchhh/all-you-need.git

# Перевірте remote
git remote -v

# Відправте код на GitHub
git branch -M main
git push -u origin main
```

## Крок 4: Перевірте .gitignore

Переконайтеся, що всі конфіденційні файли ігноруються:
- `.env` файли
- `node_modules/`
- `__pycache__/`
- `*.db` файли
- `database/` папка з базами даних
- Завантажені файли в `public/avatars/` та `public/listings/`

## Крок 5: Створіть .env файли локально (НЕ комітьте їх!)

### bot/.env
```env
TOKEN=ваш_реальний_токен
ADMINISTRATORS=[ваш_telegram_id]
```

### app/.env
```env
DATABASE_URL="file:../database/ayn_marketplace.db"
NEXT_PUBLIC_BOT_URL=https://t.me/ваш_бот
```

## Важливо!

⚠️ **НІКОЛИ не комітьте:**
- `.env` файли з реальними токенами
- Бази даних (`*.db`)
- `node_modules/`
- Персональні дані користувачів
- Завантажені фото та аватари

## Додаткові налаштування GitHub

1. Перейдіть на https://github.com/romchhh/all-you-need/settings
2. Увімкніть GitHub Pages (якщо потрібно)
3. Налаштуйте GitHub Actions (CI вже налаштований)
4. Додайте опис репозиторію та теги

## Структура файлів для GitHub

```
all-you-need/
├── .gitignore              ✅ Створено
├── README.md               ✅ Створено
├── LICENSE                 ✅ Створено
├── CONTRIBUTING.md         ✅ Створено
├── SETUP_GIT.md           ✅ Цей файл
├── .github/
│   └── workflows/
│       └── ci.yml          ✅ Створено
├── bot/
│   ├── .env.example        ⚠️ Створіть вручну
│   ├── requirements.txt    ✅ Оновлено
│   └── ...
└── app/
    ├── .env.example        ⚠️ Створіть вручну
    ├── .gitignore          ✅ Оновлено
    └── ...
```

## Після викладення

1. Оновіть README.md з актуальною інформацією
2. Додайте badges (якщо потрібно)
3. Створіть releases для версій
4. Налаштуйте GitHub Actions secrets для CI/CD


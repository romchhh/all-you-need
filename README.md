# All You Need - Marketplace Telegram Bot

Telegram маркетплейс для продажу та покупки товарів з інтеграцією міні-додатку.

## 🚀 Особливості

- 📱 **Telegram Mini App** - повнофункціональний маркетплейс у Telegram
- 🤖 **Telegram Bot** - управління через бота з адмін-панеллю
- 🛍️ **Каталог товарів** - категорії, підкатегорії, пошук та фільтри
- ❤️ **Обране** - збереження улюблених товарів
- 👤 **Профілі користувачів** - детальна інформація про продавців
- 📸 **Фото галерея** - множинні фото товарів з оптимізацією
- 🔍 **Рекомендації** - персональні рекомендації на основі переглянутих товарів
- 💬 **Швидкий перегляд** - preview товарів при довгому натисканні
- 📊 **Статистика** - перегляди, продажі, час на сервісі

## 📋 Технології

### Frontend (Next.js)
- **Next.js 16** - React фреймворк
- **TypeScript** - типізація
- **Tailwind CSS** - стилізація
- **Prisma** - ORM для роботи з базою даних
- **Telegram WebApp SDK** - інтеграція з Telegram
- **Sharp** - оптимізація зображень (WebP)

### Backend (Python)
- **aiogram 3.18** - Telegram Bot API
- **SQLite** - база даних
- **Prisma** - спільна база даних з frontend

## Docker

Повна інструкція: **[DOCKER.md](./DOCKER.md)** (підготовка, запуск, томи, оновлення, nginx).

Коротко:

```bash
ln -sf bot/.env .env
docker compose up -d --build
docker compose logs -f
```

## 🛠️ Встановлення

### Передумови

- Node.js 18+ та npm
- Python 3.10+
- Telegram Bot Token

### 1. Клонування репозиторію

```bash
git clone https://github.com/romchhh/all-you-need.git
cd all-you-need
```

### 2. Налаштування Telegram Bot

```bash
cd bot
cp .env.example .env
# Відредагуйте .env та додайте ваш TOKEN та ADMINISTRATORS
```

### 3. Встановлення залежностей для бота

```bash
cd bot
python -m venv venv
source venv/bin/activate  # На Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Встановлення залежностей для Next.js

```bash
cd app
npm install
```

### 5. Налаштування бази даних

```bash
cd app
# Створіть .env файл з DATABASE_URL
echo "DATABASE_URL=\"file:../database/ayn_marketplace.db\"" > .env

# Ініціалізуйте Prisma
npx prisma generate
npx prisma db push

# Ініціалізуйте таблиці через Python скрипт
cd ../bot
python database_functions/init_prisma_tables.py
```

### 6. Запуск

**Telegram Bot:**
```bash
cd bot
python main.py
```

**Next.js App:**
```bash
cd app
npm run dev
```

## 📁 Структура проєкту

```
all-you-need/
├── app/                    # Next.js додаток
│   ├── app/               # Next.js App Router
│   │   ├── api/           # API routes
│   │   └── page.tsx       # Головна сторінка
│   ├── components/        # React компоненти
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Утиліти та конфігурація
│   ├── prisma/            # Prisma schema
│   └── public/            # Статичні файли
├── bot/                   # Telegram Bot
│   ├── handlers/          # Обробники подій
│   ├── keyboards/         # Клавіатури
│   ├── database_functions/# Функції БД
│   └── main.py            # Точка входу
└── database/              # SQLite база даних
```

## 🔧 Налаштування

### Змінні середовища

**bot/.env:**
```env
TOKEN=your_telegram_bot_token
ADMINISTRATORS=[123456789,987654321]
```

**app/.env:**
```env
DATABASE_URL="file:../database/ayn_marketplace.db"
NEXT_PUBLIC_BOT_URL=https://t.me/your_bot
NEXT_PUBLIC_BASE_URL=https://your-domain.com

# Monobank Payment Integration
MONOBANK_API_URL=https://api.monobank.ua
MONOBANK_TOKEN=your_monobank_token
```

## 📝 API Endpoints

### Listings
- `GET /api/listings` - Отримати список оголошень
- `GET /api/listings/[id]` - Отримати деталі оголошення
- `POST /api/listings/create` - Створити оголошення
- `PUT /api/listings/[id]/update` - Оновити оголошення
- `DELETE /api/listings/[id]/delete` - Видалити оголошення
- `GET /api/listings/recommendations` - Отримати рекомендації

### User
- `GET /api/user/profile` - Отримати профіль користувача
- `POST /api/user/profile/update` - Оновити профіль
- `GET /api/user/stats` - Статистика користувача

### Payments
- `POST /api/payments/create-invoice` - Створити інвойс для поповнення балансу
- `POST /api/payments/webhook` - Webhook для обробки статусів платежів від Monobank
- `GET /api/payments/success` - Редирект після успішної оплати
- `GET /api/payments/fail` - Редирект після невдалої оплати

## 🎨 Основні компоненти

- **BazaarTab** - Головна сторінка з каталогом
- **CategoriesTab** - Категорії та підкатегорії
- **FavoritesTab** - Обране
- **ProfileTab** - Профіль користувача
- **ListingDetail** - Деталі товару
- **UserProfilePage** - Профіль продавця
- **CreateListingModal** - Створення оголошення
- **ListingPreviewModal** - Швидкий перегляд

## 📱 Telegram Mini App

Міні-додаток доступний через Telegram бота. Після запуску бота та Next.js сервера, налаштуйте Web App URL в BotFather:

```
/setmenubutton
```

Вкажіть URL вашого Next.js додатку (наприклад, `https://your-domain.com`).

## 🤝 Внесок

Вітаються pull requests! Для великих змін спочатку відкрийте issue для обговорення.

## 📄 Ліцензія

Цей проєкт розповсюджується під ліцензією MIT.

## 👤 Автор

**romchhh**

- GitHub: [@romchhh](https://github.com/romchhh)

## 🙏 Подяки

- Telegram Bot API
- Next.js команда
- Prisma команда
- Всі контриб'ютори


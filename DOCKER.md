# Docker — запуск All You Need

Два контейнери на одній машині:

| Сервіс | Образ | Що робить | Порт |
|--------|--------|-----------|------|
| `app` | `allyouneed-app` | Next.js міні-ап + API | `3000` |
| `bot` | `allyouneed-bot` | Telegram-бот + парсер | — |

Вони ділять SQLite і фото через bind-mount. Існуючі `database/`, оголошення і сесії парсера **не копіюються в образ** — лишаються на диску хоста.

---

## 1. Що потрібно

- Docker Engine + Docker Compose v2 (`docker compose version`)
- Файл `bot/.env` (як зараз на VPS)
- Вільний порт **3000** (або інший через `APP_PORT`)

На Droplet **1 GB RAM** перед першою збіркою додай swap (~2 GB), інакше `next build` може вбити процес:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 2. Підготовка (один раз)

З кореня репозиторію (`~/all-you-need` або локально):

```bash
cd ~/all-you-need   # або шлях до клону
git pull
```

### Змінні середовища

Compose читає **кореневий `.env`** для підстановки `WEBAPP_URL` / `BOT_USERNAME` **під час build**.
Контейнери в runtime беруть секрети з **`bot/.env`**.

Найпростіше — симлінк:

```bash
ln -sf bot/.env .env
```

Або скопіюй приклад і заповни:

```bash
cp .env.example .env
# відредагуй TOKEN, WEBAPP_URL, BOT_USERNAME, ADMINISTRATORS
```

Обов’язкові поля в `bot/.env`:

```env
TOKEN=...
BOT_USERNAME=your_bot
ADMINISTRATORS=[123456789]
WEBAPP_URL=https://your-domain.com
```

`WEBAPP_URL` має бути **публічним HTTPS** (не `http://localhost`), інакше Telegram Mini App і платежі не зійдуться.

### Зупини старий бот / Next.js

Якщо зараз крутиться `python main.py`, venv, pm2, systemd або `npm start` — зупини. Інакше конфлікт по токену бота і блокування SQLite.

```bash
# приклади
systemctl stop allyouneed-bot    # якщо є unit
pkill -f 'python.*main.py' || true
```

### Сесії парсера

Мають лежати тут:

```text
bot/parser/sessions/
```

Якщо `*.session` лежать прямо в `bot/parser/` — перенеси:

```bash
mkdir -p bot/parser/sessions
mv bot/parser/*.session bot/parser/sessions/ 2>/dev/null || true
```

---

## 3. Збірка і запуск

```bash
cd ~/all-you-need
docker compose up -d --build
```

Перша збірка Next.js довга (5–15 хв). Бот стартує **після** healthcheck `app`.

Перевірка:

```bash
docker compose ps
docker compose logs -f
```

Очікувані контейнери: `allyouneed-app` (healthy) і `allyouneed-bot` (running).

Міні-ап: `http://SERVER_IP:3000`  
Після nginx/Caddy на 443 — той самий URL, що в `WEBAPP_URL`.

У BotFather:

```text
/setmenubutton
```

URL = `WEBAPP_URL` (наприклад `https://allyouneed.de`).

---

## 4. Що монтується (дані на хості)

| Шлях на сервері | У контейнері | Навіщо |
|-----------------|--------------|--------|
| `./database` | `/app/database` | SQLite `ayn_marketplace.db` + `parsed_photos/` |
| `./app/public/listings` | `/app/app/public/listings` | фото оголошень |
| `./app/public/avatars` | `/app/app/public/avatars` | аватари |
| `./bot/parser/sessions` | `/app/bot/parser/sessions` | Pyrogram-сесії |
| `./bot/logs` | `/app/bot/logs` | логи бота |

`docker compose down` **не видаляє** ці папки.

---

## 5. Команди на кожен день

```bash
# статус
docker compose ps

# логи
docker compose logs -f app
docker compose logs -f bot

# рестарт одного сервісу
docker compose restart bot
docker compose restart app

# зупинити все (дані лишаються)
docker compose down

# перезібрати після git pull
git pull
docker compose up -d --build
```

Очищення фото парсера (всередині контейнера бота):

```bash
docker compose exec bot python -m parser.scripts.cleanup_parsed_photos --dry-run -v
docker compose exec bot python -m parser.scripts.cleanup_parsed_photos -v --public
```

---

## 6. Оновлення коду

```bash
cd ~/all-you-need
git pull
ln -sf bot/.env .env          # якщо симлінка зникла
docker compose up -d --build
docker compose logs -f --tail=80
```

Якщо змінював `NEXT_PUBLIC_*` / `WEBAPP_URL` / `BOT_USERNAME` — обов’язково `--build`, бо ці значення вшиваються в клієнтський бандл Next.js.

---

## 7. Типові проблеми

**`Killed` під час `docker compose build` (app)**  
Не вистачає RAM. Додай swap (розділ 1) або збери образ на потужнішій машині і завантаж на VPS.

**Prisma: debian-openssl-1.1.x vs 3.0.x**  
Перезбери app **без кешу**:

```bash
docker compose build --no-cache app
docker compose up -d app
```

**`database is locked`**  
Переконайся, що старий Python-бот і `next start` на хості вимкнені. Працюють лише контейнери.

**Парсер: немає акаунтів / session**  
Сесії мають бути в `bot/parser/sessions/`. Після переносу файлів: `docker compose restart bot`.

**Міні-ап відкривається, бот ні**  
Перевір `TOKEN` у `bot/.env` і логи: `docker compose logs bot | tail -50`.

**Фото не видно**  
Перевір, що `app/public/listings` і `database/parsed_photos` існують на хості і змонтовані (`docker compose exec app ls /app/app/public/listings`).

---

## 8. Nginx (коротко)

Проксируй HTTPS на контейнер `app:3000`. Приклад:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`WEBAPP_URL` = `https://your-domain.com` (без слеша в кінці).

---

## 9. Файли в репозиторії

```text
docker-compose.yml          # app + bot
app/Dockerfile
bot/Dockerfile
docker/app-entrypoint.sh    # prisma db push + next start
docker/bot-entrypoint.sh    # python main.py
.env.example                # для кореневого .env (build args)
bot/.env.example            # секрети бота / парсера
```

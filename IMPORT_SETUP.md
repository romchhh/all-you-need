# Налаштування для імпорту великих файлів (151MB+)

## Проблема
За замовчуванням Next.js та Nginx мають обмеження на розмір тіла запиту (~4-4.5MB), що не дозволяє завантажувати великі ZIP файли.

## Рішення

### 1. Next.js конфігурація

Вже налаштовано в `app/next.config.ts`:
- `serverActions.bodySizeLimit: '200mb'` - для Server Actions
- `maxDuration: 300` - для API routes (5 хвилин)

### 2. Nginx конфігурація (якщо використовується)

Додайте в конфігурацію Nginx:

```nginx
# В http блок або server блок
client_max_body_size 200M;
client_body_timeout 300s;
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;

# Для конкретного endpoint
location /api/admin/listings/import {
    client_max_body_size 200M;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_buffering off;
    proxy_request_buffering off;
}
```

Після змін перезапустіть Nginx:
```bash
sudo nginx -t  # перевірка конфігурації
sudo systemctl reload nginx
```

### 3. Node.js пам'ять

Якщо використовується Node.js безпосередньо, переконайтеся що є достатньо пам'яті:

```bash
# Для production
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### 4. Перевірка

Після налаштування перевірте логи:
- Консоль Next.js - мають з'явитися логи `[Import]`
- Nginx error log - `/var/log/nginx/error.log`
- Перевірте чи доходить запит до API endpoint

### 5. Альтернативне рішення

Якщо проблема залишається, можна:
1. Розбити ZIP на менші частини
2. Використати streaming завантаження
3. Завантажувати файли через окремий endpoint з chunked upload

## Поточна конфігурація

- Максимальний розмір ZIP: 200MB
- Таймаут обробки: 5 хвилин (300 секунд)
- Логування: Детальне логування на кожному етапі

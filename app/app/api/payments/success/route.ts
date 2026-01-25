import { NextRequest, NextResponse } from 'next/server';

/**
 * Редирект після успішної оплати
 * GET /api/payments/success?telegramId=...
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const telegramId = searchParams.get('telegramId');
  
  // Отримуємо посилання на бота
  const botUrl = process.env.NEXT_PUBLIC_BOT_URL 
    ? process.env.NEXT_PUBLIC_BOT_URL.replace(/\/$/, '')
    : process.env.NEXT_PUBLIC_BOT_USERNAME 
      ? `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME}` 
      : 'https://t.me/your_bot';
  
  // Повертаємо HTML сторінку з JavaScript редиректом в бот
  // Після успішної оплати завжди повертаємося в бот, а не на маркетплейс
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Оплата успішна</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
    }
    .container {
      padding: 2rem;
    }
    .spinner {
      border: 4px solid rgba(255, 255, 255, 0.3);
      border-top: 4px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
  <script>
    (function() {
      // Завжди закриваємо WebApp і повертаємося в бот після успішної оплати
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        // Закриваємо мінідодаток і повертаємося в бот
        try {
          window.Telegram.WebApp.close();
        } catch (e) {
          console.error('Error closing WebApp:', e);
          // Якщо не вдалося закрити, відкриваємо посилання на бота
          setTimeout(function() {
            window.location.href = '${botUrl}';
          }, 500);
        }
      } else {
        // Якщо не в Telegram, просто відкриваємо бот
        setTimeout(function() {
          window.location.href = '${botUrl}';
        }, 500);
      }
    })();
  </script>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Оплата успішна! Повертаємося в бот...</p>
  </div>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
}

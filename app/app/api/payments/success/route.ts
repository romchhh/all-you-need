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
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Оплата успішна</title>
  <script>
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      // Закриваємо мінідодаток і повертаємося в бот
      try {
        window.Telegram.WebApp.close();
      } catch (e) {
        console.error('Error closing WebApp:', e);
        // Якщо не вдалося закрити, відкриваємо посилання на бота
        window.location.href = '${botUrl}';
      }
    } else {
      // Якщо не в Telegram, просто відкриваємо бот
      window.location.href = '${botUrl}';
    }
  </script>
</head>
<body>
  <p>Оплата успішна! Повертаємося в бот...</p>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
}

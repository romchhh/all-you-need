import { NextRequest, NextResponse } from 'next/server';

/**
 * Редирект після оплати (загальний)
 * GET /api/payments/redirect?telegramId=...
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const telegramId = searchParams.get('telegramId');
  
  // Редиректимо на профіль користувача
  const lang = 'uk'; // Можна додати визначення мови
  const WEBAPP_URL = process.env.WEBAPP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const redirectUrl = telegramId 
    ? `${WEBAPP_URL}/${lang}/profile?telegramId=${telegramId}`
    : `${WEBAPP_URL}/${lang}/profile`;
  
  // Повертаємо HTML сторінку з JavaScript редиректом для Telegram Mini App
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.location.href = '${redirectUrl}';
    } else {
      window.location.href = '${redirectUrl}';
    }
  </script>
</head>
<body>
  <p>Redirecting...</p>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Вимкнути Server Actions для уникнення помилок
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb', // Збільшено для великих ZIP файлів
    },
  },
  // Збільшуємо обмеження для API routes (для App Router)
  // Це працює через збільшення memory limit для Node.js runtime
  // Додати обробку помилок
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Налаштування для Next.js Image компонента
  images: {
    // Дозволяємо зображення з локального API
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
    // Дозволяємо неоптимізовані зображення для Telegram WebApp сумісності
    unoptimized: false,
    // Формати зображень
    formats: ['image/webp', 'image/avif'],
    // Розміри для responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Headers для Telegram WebApp та Ngrok сумісності
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.ngrok-free.app",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: https: http: blob:",
              "connect-src 'self' https: http: wss: ws:",
              "frame-ancestors 'self' https://web.telegram.org https://telegram.org",
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

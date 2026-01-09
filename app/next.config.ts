import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Вимкнути Server Actions для уникнення помилок
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
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
};

export default nextConfig;

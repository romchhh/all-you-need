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
};

export default nextConfig;

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.WEBAPP_URL || 'https://allyouneed-marketplace.com').replace(/\/$/, '');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Особисті кабінети користувачів
        '/uk/profile',
        '/ru/profile',
        '/uk/profile/',
        '/ru/profile/',
        // Адмінка
        '/admin',
        '/admin/',
        '/admin/*',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}


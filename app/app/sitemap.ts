import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

const BASE_URL = (process.env.WEBAPP_URL || 'https://allyouneed-marketplace.com').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const languages = ['uk', 'ru'] as const;

  const staticPaths: { path: string; changeFrequency?: MetadataRoute.Sitemap[number]['changeFrequency']; priority?: number }[] =
    [
      { path: '', changeFrequency: 'daily', priority: 1 },
      { path: '/bazaar', changeFrequency: 'hourly', priority: 0.9 },
      { path: '/categories', changeFrequency: 'daily', priority: 0.8 },
      { path: '/favorites', changeFrequency: 'daily', priority: 0.6 },
      { path: '/business', changeFrequency: 'weekly', priority: 0.6 },
      { path: '/faq', changeFrequency: 'monthly', priority: 0.4 },
      { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
      { path: '/oferta', changeFrequency: 'yearly', priority: 0.3 },
      { path: '/about', changeFrequency: 'yearly', priority: 0.4 },
    ];

  const staticEntries: MetadataRoute.Sitemap = languages.flatMap((lang) =>
    staticPaths.map((item) => ({
      url: `${BASE_URL}/${lang}${item.path}`,
      lastModified: now,
      changeFrequency: item.changeFrequency,
      priority: item.priority,
    }))
  );

  // Додаємо всі активні та схвалені товари як окремі SEO-сторінки
  // Беремо тільки id, щоб обійти проблемні значення дат у БД
  const listings = await prisma.listing.findMany({
    where: {
      status: 'active',
      moderationStatus: 'approved',
    },
    select: {
      id: true,
    },
  });

  const listingEntries: MetadataRoute.Sitemap = listings.flatMap((listing) =>
    languages.map((lang) => ({
      url: `${BASE_URL}/${lang}/listing/${listing.id}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    }))
  );

  return [...staticEntries, ...listingEntries];
}


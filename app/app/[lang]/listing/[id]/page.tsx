import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import ListingPageClient from './ListingPageClient';

type RouteParams = { lang: string; id: string };

type PageProps = {
  params: Promise<RouteParams> | RouteParams;
};

export async function generateMetadata(
  props: PageProps,
  _parent: ResolvingMetadata
): Promise<Metadata> {
  const params = await props.params;
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return {
      title: 'Товар не знайдено | Trade Ground',
      robots: { index: false, follow: false },
    };
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      images: true,
      status: true,
      moderationStatus: true,
      location: true,
      price: true,
      currency: true,
    },
  });

  if (!listing || listing.status !== 'active' || listing.moderationStatus !== 'approved') {
    return {
      title: 'Товар не активний | Trade Ground',
      robots: { index: false, follow: false },
    };
  }

  const lang = params.lang === 'ru' ? 'ru' : 'uk';
  const baseUrl = (process.env.WEBAPP_URL || 'https://allyouneed-marketplace.com').replace(/\/$/, '');
  const url = `${baseUrl}/${lang}/listing/${listing.id}`;

  let imageUrl: string | undefined;
  try {
    const originals = listing.images ? (JSON.parse(listing.images) as string[]) : [];
    const raw = originals[0];
    if (raw) {
      imageUrl = raw.startsWith('http')
        ? raw
        : `${baseUrl}/api/images/${raw.replace(/^\//, '').split('?')[0]}`;
    }
  } catch {
    // ignore
  }

  const description =
    listing.description?.slice(0, 160) ||
    (lang === 'ru'
      ? 'Объявление на Trade Ground Marketplace.'
      : 'Оголошення на Trade Ground Marketplace.');

  const titlePrefix = lang === 'ru' ? 'Купить' : 'Купити';
  const fullTitle = `${titlePrefix} ${listing.title} | Trade Ground Marketplace`;

  return {
    title: fullTitle,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      type: 'website',
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: listing.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function ListingPage(props: PageProps) {
  const params = await props.params;
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    notFound();
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      moderationStatus: true,
    },
  });

  // 404 тільки якщо товар взагалі не існує
  if (!listing) {
    notFound();
  }

  const lang = params.lang === 'ru' ? 'ru' : 'uk';

  return <ListingPageClient listingId={listing.id} lang={lang} />;
}


/* Client wrapper for listing detail page used for SEO-friendly product URLs */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Listing } from '@/types';
import { useTelegram } from '@/hooks/useTelegram';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/Toast';
import { ListingDetail } from '@/components/ListingDetail';

interface ListingPageClientProps {
  listingId: number;
  lang: string;
}

export default function ListingPageClient({ listingId, lang }: ListingPageClientProps) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const { tg } = useTelegram();
  const { toast, showToast, hideToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let isMounted = true;

    const fetchListing = async () => {
      try {
        setLoading(true);
        const viewerId = searchParams.get('telegramId');
        const url = viewerId
          ? `/api/listings/${listingId}?viewerId=${viewerId}`
          : `/api/listings/${listingId}`;

        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) {
            // Якщо товар не знайдено – показуємо повідомлення і повертаємо на маркет
            showToast('Товар не знайдено або вже неактивний', 'error');
            router.replace(`/${lang}/bazaar`);
            return;
          }
          throw new Error('Не вдалося завантажити товар');
        }
        const data = await res.json();
        if (isMounted) {
          setListing(data);
        }
      } catch (e) {
        if (isMounted) {
          console.error(e);
          showToast('Сталася помилка при завантаженні товару', 'error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchListing();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const productJsonLd = useMemo(() => {
    if (!listing) return null;

    if (typeof window === 'undefined') {
      return null;
    }

    const currentUrl = window.location.href;
    const imagesArray: string[] = Array.isArray((listing as any).images)
      ? ((listing as any).images as string[])
      : [];

    // Якщо price не є числом (договірна тощо) – не додаємо блок offers
    const priceNumber = Number(listing.price);
    const hasNumericPrice = !Number.isNaN(priceNumber);

    const baseData: any = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: listing.title,
      description: listing.description,
      url: currentUrl,
      image: imagesArray,
      // Локація як додаткова інформація
      areaServed: listing.location,
    };

    if (hasNumericPrice && listing.currency) {
      baseData.offers = {
        '@type': 'Offer',
        priceCurrency: listing.currency,
        price: priceNumber,
        url: currentUrl,
        availability: 'https://schema.org/InStock',
      };
    }

    return baseData;
  }, [listing]);

  let content;

  if (loading) {
    content = (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Завантаження товару...</p>
      </div>
    );
  } else if (!listing) {
    content = (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 text-center">
        <p className="mb-3">Товар не знайдено або вже неактивний.</p>
        <p className="mb-5 text-sm text-white/80 max-w-md">
          Актуальний стан оголошення можна перевірити у нашому Telegram‑боті Trade Ground Marketplace.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.replace(`/${lang}/bazaar`)}
            className="px-4 py-2 rounded-xl bg-white text-black font-semibold"
          >
            Повернутись на маркет
          </button>
          <a
            href="https://t.me/TradeGroundBot?start=linktowatch_12"
            className="px-4 py-2 rounded-xl border border-white text-white font-semibold"
            target="_blank"
            rel="noopener noreferrer"
          >
            Відкрити Telegram‑бот
          </a>
        </div>
      </div>
    );
  } else {
    content = (
      <ListingDetail
        key={listing.id}
        listing={listing}
        isFavorite={false}
        onClose={() => router.push(`/${lang}/bazaar`)}
        onBack={() => router.back()}
        onToggleFavorite={() => {
          // На SEO-сторінці просто відкриваємо міні-додаток, де є повна логіка обраного
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            const telegramId = url.searchParams.get('telegramId');
            const botUrl = process.env.NEXT_PUBLIC_BOT_USERNAME
              ? `https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME}`
              : '';
            if (botUrl) {
              const startParam = telegramId
                ? `listing_${listing.id}_fav_${telegramId}`
                : `listing_${listing.id}`;
              window.location.href = `${botUrl}?start=${startParam}`;
            }
          }
        }}
        favorites={new Set<number>()}
        tg={tg}
      />
    );
  }

  return (
    <>
      {productJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      {content}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </>
  );
}


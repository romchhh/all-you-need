'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TelegramWebApp } from '@/types/telegram';
import { Listing } from '@/types';
import { ListingGridSkeleton } from '@/components/ui/SkeletonLoader';
import { usePageTransition } from '@/contexts/PageTransitionContext';

const UserProfilePage = dynamic(
  () => import('@/components/profile/UserProfilePage').then((m) => ({ default: m.UserProfilePage })),
  { ssr: false }
);
const BusinessProfilePage = dynamic(
  () => import('@/components/business/BusinessProfilePage').then((m) => ({ default: m.BusinessProfilePage })),
  { ssr: false }
);

interface SellerProfileRouterProps {
  sellerTelegramId: string;
  sellerName: string;
  sellerAvatar: string;
  sellerUsername?: string | null;
  sellerPhone?: string | null;
  onClose: () => void;
  onSelectListing: (listing: Listing) => void;
  onToggleFavorite: (id: number) => void;
  favorites: Set<number>;
  tg: TelegramWebApp | null;
  onBackToPreviousListing?: (() => void) | null;
}

export function SellerProfileRouter(props: SellerProfileRouterProps) {
  const { sellerTelegramId } = props;
  const { show: showPageLoader, hide: hidePageLoader } = usePageTransition();
  const [mode, setMode] = useState<'loading' | 'business' | 'personal'>('loading');

  useEffect(() => {
    let cancelled = false;
    setMode('loading');
    fetch(`/api/business-profile/resolve?telegramId=${encodeURIComponent(sellerTelegramId)}`)
      .then((r) => (r.ok ? r.json() : { mode: 'personal' }))
      .then((data) => {
        if (cancelled) return;
        setMode(data?.mode === 'business' ? 'business' : 'personal');
      })
      .catch(() => {
        if (!cancelled) setMode('personal');
      });
    return () => {
      cancelled = true;
    };
  }, [sellerTelegramId]);

  useEffect(() => {
    if (mode === 'loading') {
      showPageLoader({ minMs: 320 });
      return;
    }
    void hidePageLoader({ minMs: 320 });
  }, [mode, showPageLoader, hidePageLoader]);

  if (mode === 'loading') {
    return (
      <div className="min-h-screen p-4 pt-20">
        <ListingGridSkeleton count={4} />
      </div>
    );
  }

  if (mode === 'business') {
    return <BusinessProfilePage {...props} />;
  }

  return <UserProfilePage {...props} />;
}

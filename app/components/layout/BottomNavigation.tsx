'use client';

import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { NavIcon } from '@/components/layout/NavIcon';
import { dispatchBazaarRestoreListingScroll } from '@/lib/bazaar/bazaarScrollStorage';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { usePageTransition } from '@/contexts/PageTransitionContext';

interface BottomNavigationProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onCloseDetail?: () => void;
  onCreateListing?: () => void;
  favoritesCount?: number;
  tg: TelegramWebApp | null;
}

export const BottomNavigation = ({
  activeTab,
  onTabChange,
  onCloseDetail,
  onCreateListing,
  tg,
}: BottomNavigationProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const { show: showPageLoader, hide: hidePageLoader } = usePageTransition();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const lang = (params?.lang as string) || 'uk';
  const [mounted, setMounted] = useState(false);
  const [hiddenByOverlay, setHiddenByOverlay] = useState(false);
  const [hiddenByKeyboard, setHiddenByKeyboard] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const pendingTabNavRef = useRef(false);
  const isSearchPage = Boolean(pathname?.includes('/search'));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pendingTabNavRef.current) return;
    pendingTabNavRef.current = false;
    void hidePageLoader({ minMs: 350 });
  }, [pathname, hidePageLoader]);

  useEffect(() => {
    const syncHiddenState = () => {
      setHiddenByOverlay(document.body.hasAttribute('data-hide-bottom-nav'));
    };

    syncHiddenState();

    const observer = new MutationObserver(syncHiddenState);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-hide-bottom-nav'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isTextInput = (el: Element | null): boolean => {
      if (!el || !(el instanceof HTMLElement)) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName !== 'INPUT') return el.isContentEditable;
      const type = (el as HTMLInputElement).type;
      return !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'hidden', 'range', 'color'].includes(
        type
      );
    };

    const updateKeyboardOffset = () => {
      if (!isSearchPage) {
        setKeyboardOffset(0);
        return;
      }
      const vv = window.visualViewport;
      if (!vv || !isTextInput(document.activeElement)) {
        setKeyboardOffset(0);
        return;
      }
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset > 80 ? offset : 0);
    };

    const syncKeyboardHidden = () => {
      if (isSearchPage) {
        setHiddenByKeyboard(false);
        updateKeyboardOffset();
        return;
      }
      setHiddenByKeyboard(isTextInput(document.activeElement));
      setKeyboardOffset(0);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isTextInput(e.target as Element)) {
        if (isSearchPage) {
          updateKeyboardOffset();
        } else {
          setHiddenByKeyboard(true);
        }
      }
    };

    const onFocusOut = () => {
      requestAnimationFrame(syncKeyboardHidden);
    };

    const vv = window.visualViewport;
    const onViewportResize = () => {
      if (!vv) return;
      if (isSearchPage) {
        updateKeyboardOffset();
        return;
      }
      const keyboardLikelyOpen = window.innerHeight - vv.height > 120;
      if (keyboardLikelyOpen && isTextInput(document.activeElement)) {
        setHiddenByKeyboard(true);
      } else if (!isTextInput(document.activeElement)) {
        setHiddenByKeyboard(false);
      }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewportResize);
    vv?.addEventListener('scroll', onViewportResize);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportResize);
      vv?.removeEventListener('scroll', onViewportResize);
    };
  }, [isSearchPage]);

  const getActiveTab = () => {
    if (activeTab) return activeTab;
    if (pathname?.includes('/bazaar')) return 'bazaar';
    if (pathname?.includes('/categories')) return 'categories';
    if (pathname?.includes('/favorites')) return 'favorites';
    if (pathname?.includes('/profile')) return 'profile';
    return 'bazaar';
  };

  const currentActiveTab = getActiveTab();

  useEffect(() => {
    const tabs = ['bazaar', 'categories', 'favorites', 'profile'] as const;
    tabs.forEach((tab) => {
      if (tab !== currentActiveTab) {
        router.prefetch(`/${lang}/${tab}`);
      }
    });
  }, [lang, currentActiveTab, router]);

  const handleTabChange = (tab: string) => {
    if (tab === currentActiveTab) {
      if (tab === 'bazaar' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tradeground-home-refresh'));
        dispatchBazaarRestoreListingScroll();
      }
      return;
    }

    tg?.HapticFeedback.impactOccurred('light');
    pendingTabNavRef.current = true;
    showPageLoader({ minMs: 350 });

    if (typeof window !== 'undefined') {
      const currentScrollKey = `${currentActiveTab}ScrollPosition`;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      localStorage.setItem(currentScrollKey, scrollY.toString());
    }

    if (onCloseDetail) {
      onCloseDetail();
    }

    if (onTabChange) {
      onTabChange(tab);
    } else {
      const routeMap: Record<string, string> = {
        bazaar: 'bazaar',
        categories: 'categories',
        favorites: 'favorites',
        profile: 'profile',
      };
      const route = routeMap[tab] || 'bazaar';
      router.push(`/${lang}/${route}`);
    }

    // Якщо pathname не зміниться (напр. закрили оверлей на тому ж табі) — ховаємо лоадер самі
    window.setTimeout(() => {
      if (!pendingTabNavRef.current) return;
      pendingTabNavRef.current = false;
      void hidePageLoader();
    }, 450);
  };

  if (!mounted || hiddenByOverlay || (!isSearchPage && hiddenByKeyboard) || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <nav
      data-bottom-nav
      className={`fixed bottom-0 left-0 right-0 z-[1000] border-t pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] pt-1.5 transition-transform duration-150 ${
        isLight
          ? 'border-gray-200/80 bg-white/95 shadow-[0_-6px_32px_-8px_rgba(0,0,0,0.08)] backdrop-blur-md'
          : 'border-white/10 bg-[#000000] shadow-[0_-8px_40px_-6px_rgba(0,0,0,0.45)]'
      }`}
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
        transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined,
      }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 sm:px-4 lg:max-w-6xl lg:px-8">
        <button
          type="button"
          onClick={() => handleTabChange('bazaar')}
          className={`group flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 ${
            currentActiveTab === 'bazaar'
              ? isLight
                ? 'font-semibold text-[#3F5331]'
                : 'font-semibold text-[#C8E6A0]'
              : isLight
                ? 'text-gray-600 hover:text-[#3F5331]'
                : 'text-white hover:text-[#C8E6A0]'
          }`}
        >
          <div className={`shrink-0 ${currentActiveTab === 'bazaar' ? 'scale-105' : ''}`}>
            <NavIcon icon="home" />
          </div>
          <span className="mt-1 max-w-full truncate font-montserrat text-[clamp(8px,2.2vw,11px)] font-medium">
            {t('navigation.bazaar')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCreateListing?.();
            tg?.HapticFeedback.impactOccurred('medium');
          }}
          className={`group flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 ${
            isLight ? 'text-gray-600 hover:text-[#3F5331]' : 'text-white hover:text-[#C8E6A0]'
          }`}
        >
          <div className="shrink-0">
            <NavIcon icon="add" />
          </div>
          <span className="mt-1 max-w-full truncate font-montserrat text-[clamp(8px,2.2vw,11px)] font-medium">
            {t('common.add')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('favorites')}
          className={`group relative flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 ${
            currentActiveTab === 'favorites'
              ? isLight
                ? 'font-semibold text-[#3F5331]'
                : 'font-semibold text-[#C8E6A0]'
              : isLight
                ? 'text-gray-600 hover:text-[#3F5331]'
                : 'text-white hover:text-[#C8E6A0]'
          }`}
        >
          <div className={`shrink-0 ${currentActiveTab === 'favorites' ? 'scale-105' : ''}`}>
            <NavIcon icon="favorites" />
          </div>
          <span className="mt-1 max-w-full truncate font-montserrat text-[clamp(8px,2.2vw,11px)] font-medium">
            {t('navigation.favorites')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`group flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 ${
            currentActiveTab === 'profile'
              ? isLight
                ? 'font-semibold text-[#3F5331]'
                : 'font-semibold text-[#C8E6A0]'
              : isLight
                ? 'text-gray-600 hover:text-[#3F5331]'
                : 'text-white hover:text-[#C8E6A0]'
          }`}
        >
          <div className={`shrink-0 ${currentActiveTab === 'profile' ? 'scale-105' : ''}`}>
            <NavIcon icon="profile" />
          </div>
          <span className="mt-1 max-w-full truncate font-montserrat text-[clamp(8px,2.2vw,11px)] font-medium">
            {t('navigation.profile')}
          </span>
        </button>
      </div>
    </nav>,
    document.body
  );
};

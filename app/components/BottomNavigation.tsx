import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface BottomNavigationProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onCloseDetail?: () => void;
  onCreateListing?: () => void;
  favoritesCount?: number;
  tg: TelegramWebApp | null;
}

export const BottomNavigation = ({ activeTab, onTabChange, onCloseDetail, onCreateListing, favoritesCount = 0, tg }: BottomNavigationProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const lang = (params?.lang as string) || 'uk';
  const navRef = useRef<HTMLDivElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // Відстежуємо фокус на полях введення для приховування меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        const activeElement = document.activeElement;
        if (
          !activeElement ||
          (activeElement instanceof HTMLElement &&
           activeElement.tagName !== 'INPUT' &&
           activeElement.tagName !== 'TEXTAREA' &&
           !activeElement.isContentEditable)
        ) {
          setIsInputFocused(false);
        }
      });
    };

    const handleVisualViewportChange = () => {
      if (!window.visualViewport) return;
      const viewportHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      const keyboardOpen = viewportHeight < windowHeight * 0.75;
      
      if (keyboardOpen) {
        setIsInputFocused(true);
      } else {
        const activeElement = document.activeElement;
        if (
          !activeElement ||
          (activeElement instanceof HTMLElement &&
           activeElement.tagName !== 'INPUT' &&
           activeElement.tagName !== 'TEXTAREA' &&
           !activeElement.isContentEditable)
        ) {
          setIsInputFocused(false);
        }
      }
    };

    document.addEventListener('focusin', handleFocusIn, { passive: true, capture: true });
    document.addEventListener('focusout', handleFocusOut, { passive: true, capture: true });
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange, { passive: true });
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
      }
    };
  }, []);
  
  // Запобігаємо підтягуванню меню при відкритті клавіатури
  useEffect(() => {
    if (typeof window === 'undefined' || !navRef.current) return;

    const navElement = navRef.current;
    const transformValue = isInputFocused ? 'translateY(100%)' : 'translateY(0)';
    
    navElement.style.transform = transformValue;
    navElement.style.setProperty('-webkit-transform', transformValue);
  }, [isInputFocused]);
  
  // Визначаємо активну вкладку з URL, якщо не передано явно
  const getActiveTab = () => {
    if (activeTab) return activeTab;
    
    if (pathname?.includes('/bazaar')) return 'bazaar';
    if (pathname?.includes('/categories')) return 'categories';
    if (pathname?.includes('/favorites')) return 'favorites';
    if (pathname?.includes('/profile')) return 'profile';
    
    return 'bazaar'; // за замовчуванням
  };
  
  const currentActiveTab = getActiveTab();
  
  const handleTabChange = (tab: string) => {
    // Повторне натискання «Головна» (базар) — оновлення сторінки та лічильників
    if (tab === currentActiveTab) {
      if (tab === 'bazaar' && typeof window !== 'undefined') {
        window.location.href = `/${lang}/bazaar`;
      }
      return;
    }
    
    tg?.HapticFeedback.impactOccurred('light');
    
    // Зберігаємо позицію скролу поточної сторінки перед переходом
    if (typeof window !== 'undefined') {
      const currentScrollKey = `${currentActiveTab}ScrollPosition`;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      localStorage.setItem(currentScrollKey, scrollY.toString());
    }
    
    // Закриваємо деталі, якщо відкриті
    if (onCloseDetail) {
      onCloseDetail();
    }
    
    // Якщо є callback, використовуємо його
    if (onTabChange) {
      onTabChange(tab);
      return;
    }
    
    // Інакше використовуємо router
    const routeMap: Record<string, string> = {
      'bazaar': 'bazaar',
      'categories': 'categories',
      'favorites': 'favorites',
      'profile': 'profile'
    };
    const route = routeMap[tab] || 'bazaar';
    router.push(`/${lang}/${route}`);
  };

  return (
  <>
    <div 
      ref={navRef}
      className={`fixed bottom-0 left-0 right-0 z-50 safe-area-bottom pb-2 transition-transform duration-200 ease-in-out ${
        isLight
          ? 'border-t border-gray-200/80 bg-white/95 shadow-[0_-6px_32px_-8px_rgba(0,0,0,0.08)] backdrop-blur-md'
          : 'border-t border-white/10 bg-[#000000] shadow-[0_-8px_40px_-6px_rgba(0,0,0,0.45)]'
      }`}
      style={{
        transform: isInputFocused ? 'translateY(100%)' : 'translateY(0)',
        willChange: 'transform',
        visibility: isInputFocused ? 'hidden' : 'visible',
        opacity: isInputFocused ? 0 : 1,
        pointerEvents: isInputFocused ? 'none' : 'auto'
      }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1.5 sm:px-4 lg:max-w-6xl lg:px-8">
      {/* Головна */}
      <button
        onClick={() => handleTabChange('bazaar')}
        className={`group flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 transition-all ${
          currentActiveTab === 'bazaar'
            ? isLight
              ? 'font-semibold text-[#3F5331]'
              : 'font-semibold text-[#C8E6A0]'
            : isLight
              ? 'text-gray-600 hover:text-[#3F5331]'
              : 'text-white hover:text-[#C8E6A0]'
        }`}
      >
        <div
          className={`shrink-0 transition-transform ${currentActiveTab === 'bazaar' ? 'scale-105' : ''}`}
        >
          <NavIcon icon="home" />
        </div>
        <span className="text-[clamp(8px,2.2vw,11px)] font-medium font-montserrat mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{t('navigation.bazaar')}</span>
      </button>

      {/* Додати оголошення */}
      <button
        onClick={() => {
          if (onCreateListing) {
            onCreateListing();
            tg?.HapticFeedback.impactOccurred('medium');
          }
        }}
        className={`flex flex-col items-center min-w-0 flex-1 py-1 px-1 rounded-xl transition-all group ${
          isLight ? 'text-gray-600 hover:text-[#3F5331]' : 'text-white hover:text-[#C8E6A0]'
        }`}
      >
        <div className="shrink-0 transition-transform">
          <NavIcon icon="add" />
        </div>
        <span className="text-[clamp(8px,2.2vw,11px)] font-medium font-montserrat mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{t('common.add')}</span>
      </button>

      {/* Обране */}
      <button
        onClick={() => handleTabChange('favorites')}
        className={`group relative flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 transition-all ${
          currentActiveTab === 'favorites'
            ? isLight
              ? 'font-semibold text-[#3F5331]'
              : 'font-semibold text-[#C8E6A0]'
            : isLight
              ? 'text-gray-600 hover:text-[#3F5331]'
              : 'text-white hover:text-[#C8E6A0]'
        }`}
      >
        <div
          className={`shrink-0 transition-transform ${currentActiveTab === 'favorites' ? 'scale-105' : ''}`}
        >
          <NavIcon icon="favorites" />
        </div>
        <span className="text-[clamp(8px,2.2vw,11px)] font-medium font-montserrat mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{t('navigation.favorites')}</span>
      </button>

      {/* Профіль */}
      <button
        onClick={() => handleTabChange('profile')}
        className={`group flex min-w-0 flex-1 flex-col items-center rounded-xl px-1 py-1 transition-all ${
          currentActiveTab === 'profile'
            ? isLight
              ? 'font-semibold text-[#3F5331]'
              : 'font-semibold text-[#C8E6A0]'
            : isLight
              ? 'text-gray-600 hover:text-[#3F5331]'
              : 'text-white hover:text-[#C8E6A0]'
        }`}
      >
        <div
          className={`shrink-0 transition-transform ${currentActiveTab === 'profile' ? 'scale-105' : ''}`}
        >
          <NavIcon icon="profile" />
        </div>
        <span className="text-[clamp(8px,2.2vw,11px)] font-medium font-montserrat mt-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{t('navigation.profile')}</span>
      </button>
    </div>
  </div>
  </>
  );
};


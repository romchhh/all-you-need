import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';
import { useEffect, useRef, useState } from 'react';

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
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const lang = (params?.lang as string) || 'uk';
  const navRef = useRef<HTMLDivElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  // Відстежуємо фокус на полях введення для приховування меню
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let focusTimeout: NodeJS.Timeout | null = null;
    let blurTimeout: NodeJS.Timeout | null = null;

    const handleFocusIn = (e: FocusEvent) => {
      // Скасовуємо попередній blur timeout якщо він є
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }

      const target = e.target;
      // Перевіряємо, чи це поле введення
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        // Миттєво приховуємо меню
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Скасовуємо попередній focus timeout якщо він є
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }

      // Невелика затримка, щоб переконатися, що фокус дійсно втрачено
      blurTimeout = setTimeout(() => {
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
      }, 150);
    };

    // Відстежуємо зміни висоти viewport (відкриття/закриття клавіатури)
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        // Якщо viewport менший за window, значить клавіатура відкрита
        const keyboardOpen = viewportHeight < windowHeight * 0.75;
        
        // Миттєво оновлюємо стан
        if (keyboardOpen) {
          setIsInputFocused(true);
        } else {
          // Перевіряємо, чи дійсно немає фокусу перед приховуванням
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
      }
    };

    // Додаткова перевірка при зміні розміру вікна
    const handleResize = () => {
      if (window.visualViewport) {
        handleVisualViewportChange();
      }
    };

    // Перевіряємо початковий стан
    const checkInitialState = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === 'INPUT' ||
         activeElement.tagName === 'TEXTAREA' ||
         activeElement.isContentEditable)
      ) {
        setIsInputFocused(true);
      }
    };

    // Перевіряємо початковий стан
    checkInitialState();

    document.addEventListener('focusin', handleFocusIn, true); // Використовуємо capture phase
    document.addEventListener('focusout', handleFocusOut, true);
    window.addEventListener('resize', handleResize);
    
    // Використовуємо Visual Viewport API для точного визначення клавіатури
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      if (blurTimeout) clearTimeout(blurTimeout);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, []);
  
  // Запобігаємо підтягуванню меню при відкритті клавіатури
  useEffect(() => {
    if (typeof window === 'undefined' || !navRef.current) return;

    const navElement = navRef.current;
    
    // Функція для фіксації позиції - запобігає підтягуванню при зміні viewport
    const fixPosition = () => {
      if (navElement) {
        // Використовуємо requestAnimationFrame для синхронізації
        requestAnimationFrame(() => {
          if (navElement) {
            const transformValue = isInputFocused ? 'translateY(100%)' : 'translateY(0) translateZ(0)';
            navElement.style.position = 'fixed';
            navElement.style.bottom = '0';
            navElement.style.left = '0';
            navElement.style.right = '0';
            // Використовуємо translateY(0) замість translateZ(0) для кращої фіксації
            navElement.style.transform = transformValue;
            navElement.style.setProperty('-webkit-transform', transformValue);
          }
        });
      }
    };

    // Встановлюємо позицію при завантаженні
    fixPosition();

    // Обробляємо зміни viewport (відкриття/закриття клавіатури)
    const handleResize = () => {
      fixPosition();
    };

    // Викликаємо fixPosition при зміні isInputFocused
    fixPosition();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
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
    // Якщо це той самий таб, не робимо нічого
    if (tab === currentActiveTab) {
      return;
    }
    
    // Зберігаємо позицію скролу поточної сторінки перед переходом
    if (typeof window !== 'undefined') {
      const currentScrollKey = `${currentActiveTab}ScrollPosition`;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      localStorage.setItem(currentScrollKey, scrollY.toString());
    }
    
    // Якщо є onTabChange callback, використовуємо його (для старої реалізації)
    if (onTabChange) {
      // Спочатку закриваємо деталі товару/профілю, якщо вони відкриті
      const hasOpenDetails = onCloseDetail !== undefined;
      if (onCloseDetail) {
        onCloseDetail();
      }
      // Якщо були відкриті деталі, використовуємо затримку для закриття перед переходом
      if (hasOpenDetails) {
        setTimeout(() => {
          onTabChange(tab);
        }, 100);
      } else {
        onTabChange(tab);
      }
    } else {
      // Спочатку закриваємо деталі товару/профілю, якщо вони відкриті
      const hasOpenDetails = onCloseDetail !== undefined;
      if (onCloseDetail) {
        onCloseDetail();
      }
      // Інакше використовуємо router для навігації
      const routeMap: Record<string, string> = {
        'bazaar': 'bazaar',
        'categories': 'categories',
        'favorites': 'favorites',
        'profile': 'profile'
      };
      const route = routeMap[tab] || 'bazaar';
      // Якщо були відкриті деталі, використовуємо затримку для закриття перед переходом
      if (hasOpenDetails) {
        setTimeout(() => {
          router.push(`/${lang}/${route}`);
        }, 100);
      } else {
        router.push(`/${lang}/${route}`);
      }
    }
    tg?.HapticFeedback.impactOccurred('light');
  };

  return (
  <>
    <div 
      ref={navRef}
      className="fixed bottom-0 left-0 right-0 bg-[#000000] safe-area-bottom z-50 pb-4 transition-transform duration-200 ease-in-out"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        transform: isInputFocused ? 'translateY(100%)' : 'translateY(0) translateZ(0)',
        willChange: 'transform',
        // Запобігаємо підтягуванню при відкритті клавіатури
        maxHeight: 'none',
        height: 'auto',
        // Додаткова фіксація для мобільних пристроїв (використовуємо setProperty в useEffect)
        backfaceVisibility: 'hidden',
        perspective: '1000px',
        // Приховуємо меню, коли активне поле введення
        visibility: isInputFocused ? 'hidden' : 'visible',
        opacity: isInputFocused ? 0 : 1,
        // Додаткова фіксація - не дозволяємо меню підтягуватися
        pointerEvents: isInputFocused ? 'none' : 'auto'
      }}
    >
      <div className="max-w-2xl mx-auto flex justify-around items-center px-2 py-2 border-t-2 border-white rounded-t-3xl bg-[#000000]">
      {/* Головна */}
      <button
        onClick={() => handleTabChange('bazaar')}
        className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all group ${
          currentActiveTab === 'bazaar' 
            ? 'text-[#D3F1A7]' 
            : 'text-white hover:text-[#D3F1A7]'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'bazaar' ? 'scale-110' : ''}`}>
          <NavIcon icon="home" />
        </div>
        <span className="text-xs font-medium font-montserrat mt-2.5">{t('navigation.bazaar')}</span>
      </button>

      {/* Додати оголошення */}
      <button
        onClick={() => {
          if (onCreateListing) {
            onCreateListing();
            tg?.HapticFeedback.impactOccurred('medium');
          }
        }}
        className="flex flex-col items-center py-2 px-4 rounded-xl transition-all text-white hover:text-[#D3F1A7] group"
      >
        <div className="transition-transform">
          <NavIcon icon="add" />
        </div>
        <span className="text-xs font-medium font-montserrat mt-2.5">{t('common.add')}</span>
      </button>

      {/* Обране */}
      <button
        onClick={() => handleTabChange('favorites')}
        className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all relative group ${
          currentActiveTab === 'favorites' 
            ? 'text-[#D3F1A7]' 
            : 'text-white hover:text-[#D3F1A7]'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'favorites' ? 'scale-110' : ''}`}>
          <NavIcon icon="favorites" />
        </div>
        <span className="text-xs font-medium font-montserrat mt-2.5">{t('navigation.favorites')}</span>
      </button>

      {/* Профіль */}
      <button
        onClick={() => handleTabChange('profile')}
        className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all group ${
          currentActiveTab === 'profile' 
            ? 'text-[#D3F1A7]' 
            : 'text-white hover:text-[#D3F1A7]'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'profile' ? 'scale-110' : ''}`}>
          <NavIcon icon="profile" />
        </div>
        <span className="text-xs font-medium font-montserrat mt-2.5">{t('navigation.profile')}</span>
      </button>
    </div>
  </div>
  </>
  );
};


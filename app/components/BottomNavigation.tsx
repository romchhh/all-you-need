import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';

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
    // Зберігаємо позицію скролу поточної сторінки перед переходом
    if (typeof window !== 'undefined') {
      const currentScrollKey = `${currentActiveTab}ScrollPosition`;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      localStorage.setItem(currentScrollKey, scrollY.toString());
    }
    
    // Закриваємо деталі товару/профілю при зміні вкладки
    if (onCloseDetail) {
      onCloseDetail();
    }
    
    // Якщо є onTabChange callback, використовуємо його (для старої реалізації)
    if (onTabChange) {
      onTabChange(tab);
    } else {
      // Інакше використовуємо router для навігації
      const routeMap: Record<string, string> = {
        'bazaar': 'bazaar',
        'categories': 'categories',
        'favorites': 'favorites',
        'profile': 'profile'
      };
      const route = routeMap[tab] || 'bazaar';
      router.push(`/${lang}/${route}`);
    }
    tg?.HapticFeedback.impactOccurred('light');
  };

  return (
  <>
    <div className="fixed bottom-0 left-0 right-0 bg-[#000000] safe-area-bottom z-50 pb-4">
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


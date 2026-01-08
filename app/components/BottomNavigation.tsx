import { TelegramWebApp } from '@/types/telegram';
import { Store, Heart, User, Plus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams, usePathname } from 'next/navigation';

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
    {/* Градієнтний перехід зверху футера */}
    <div className="fixed bottom-[64px] left-0 right-0 h-16 pointer-events-none z-40">
      <div className="max-w-2xl mx-auto h-full bg-gradient-to-t from-white via-white/60 to-transparent"></div>
    </div>
    
    <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-200/50 safe-area-bottom shadow-lg z-50 pb-4">
      <div className="max-w-2xl mx-auto flex justify-around items-center px-2 py-2">
      {/* Каталог */}
      <button
        onClick={() => handleTabChange('bazaar')}
        className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all ${
          currentActiveTab === 'bazaar' 
            ? 'text-blue-500 bg-blue-50' 
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'bazaar' ? 'scale-110' : ''}`}>
          <Store size={24} strokeWidth={currentActiveTab === 'bazaar' ? 2.5 : 2} />
        </div>
        <span className="text-xs font-medium">{t('navigation.bazaar')}</span>
      </button>

      {/* Додати оголошення */}
      <button
        onClick={() => {
          if (onCreateListing) {
            onCreateListing();
            tg?.HapticFeedback.impactOccurred('medium');
          }
        }}
        className="flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all text-gray-400 hover:text-gray-600"
      >
        <div className="transition-transform">
          <Plus size={24} strokeWidth={2} />
        </div>
        <span className="text-xs font-medium">{t('common.add')}</span>
      </button>

      {/* Обране */}
      <button
        onClick={() => handleTabChange('favorites')}
        className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all relative ${
          currentActiveTab === 'favorites' 
            ? 'text-red-500 bg-red-50' 
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'favorites' ? 'scale-110' : ''}`}>
          <Heart size={24} strokeWidth={currentActiveTab === 'favorites' ? 2.5 : 2} fill={currentActiveTab === 'favorites' ? 'currentColor' : 'none'} />
        </div>
        <span className="text-xs font-medium">{t('navigation.favorites')}</span>
      </button>

      {/* Профіль */}
      <button
        onClick={() => handleTabChange('profile')}
        className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-all ${
          currentActiveTab === 'profile' 
            ? 'text-purple-500 bg-purple-50' 
            : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <div className={`transition-transform ${currentActiveTab === 'profile' ? 'scale-110' : ''}`}>
          <User size={24} strokeWidth={currentActiveTab === 'profile' ? 2.5 : 2} />
        </div>
        <span className="text-xs font-medium">{t('navigation.profile')}</span>
      </button>
    </div>
  </div>
  </>
  );
};


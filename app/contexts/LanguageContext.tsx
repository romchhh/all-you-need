'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type Language = 'uk' | 'ru';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
  initialLanguage?: Language;
  userTelegramId?: string;
}

export const LanguageProvider = ({ children, initialLanguage, userTelegramId }: LanguageProviderProps) => {
  const router = useRouter();
  const pathname = usePathname();

  // Визначаємо мову з URL або localStorage
  const getInitialLanguage = (): Language => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/ru')) return 'ru';
      if (pathname.startsWith('/uk')) return 'uk';
      const saved = localStorage.getItem('language');
      if (saved === 'ru' || saved === 'uk') return saved as Language;
    }
    return initialLanguage || 'uk';
  };

  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [isLoadingLanguage, setIsLoadingLanguage] = useState(false);

  // Завжди беремо мову з БД і синхронізуємо URL (щоб при заході/виході не скидалась на uk)
  useEffect(() => {
    const loadLanguageFromDB = async () => {
      if (typeof window === 'undefined') return;
      const telegramId = userTelegramId || (window as any).__userTelegramId;
      const urlParams = new URLSearchParams(window.location.search);
      const telegramIdFromUrl = urlParams.get('telegramId');
      const finalTelegramId = telegramId || telegramIdFromUrl;
      if (finalTelegramId) {
        setIsLoadingLanguage(true);
        try {
          const response = await fetch(`/api/user/language?telegramId=${finalTelegramId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.language && (data.language === 'uk' || data.language === 'ru')) {
              const dbLang = data.language as Language;
              setLanguageState(dbLang);
              localStorage.setItem('language', dbLang);
              // Якщо URL з префіксом іншої мови — перенаправляємо на ту саму сторінку з правильною мовою
              const path = pathname ?? window.location.pathname;
              const currentPrefix = path.startsWith('/ru') ? 'ru' : path.startsWith('/uk') ? 'uk' : null;
              if (currentPrefix && currentPrefix !== dbLang) {
                const pathWithoutLang = path.replace(/^\/(uk|ru)/, '') || '/';
                const newPath = `/${dbLang}${pathWithoutLang.startsWith('/') ? pathWithoutLang : '/' + pathWithoutLang}`;
                const search = window.location.search || '';
                router.replace(newPath + search);
              }
            }
          }
        } catch (error) {
          console.error('Failed to load language from database:', error);
        } finally {
          setIsLoadingLanguage(false);
        }
      }
    };

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasTelegramIdInUrl = urlParams?.get('telegramId');
    const delay = hasTelegramIdInUrl ? 100 : 1000;
    const timer = setTimeout(loadLanguageFromDB, delay);

    const checkInterval = setInterval(() => {
      if ((window as any).__userTelegramId && !userTelegramId) {
        loadLanguageFromDB();
        clearInterval(checkInterval);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      clearInterval(checkInterval);
    };
  }, [userTelegramId, pathname, router]);

  useEffect(() => {
    // Завантажуємо переклади
    import(`@/locales/${language}.json`)
      .then((module) => {
        setTranslations(module.default);
      })
      .catch((err) => {
        console.error('Failed to load translations:', err);
      });
  }, [language]);

  useEffect(() => {
    // Зберігаємо мову в localStorage та БД
    if (typeof window !== 'undefined' && !isLoadingLanguage) {
      localStorage.setItem('language', language);
      
      // Зберігаємо мову в БД якщо є telegramId
      if (userTelegramId) {
        fetch('/api/user/language', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telegramId: userTelegramId,
            language: language,
          }),
        }).catch((error) => {
          console.error('Failed to save language to database:', error);
        });
      }
      
      // URL оновлюється через router.push в LanguageSwitcher
      // Тут не оновлюємо URL, щоб уникнути конфліктів
    }
  }, [language, isLoadingLanguage, userTelegramId]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let value: any = translations;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Повертаємо ключ, якщо переклад не знайдено
      }
    }
    
    if (typeof value === 'string') {
      // Замінюємо параметри в рядку
      if (params) {
        return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
          return params[paramKey] || match;
        });
      }
      return value;
    }
    
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};


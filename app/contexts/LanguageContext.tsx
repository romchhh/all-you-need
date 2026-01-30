'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type Language = 'uk' | 'ru';

const LANG_COOKIE_NAME = 'lang';
const LANG_COOKIE_MAX_AGE = 31536000; // 1 year

function getTelegramIdSync(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('telegramId');
  if (fromUrl) return fromUrl;
  const fromWindow = (window as any).__userTelegramId;
  if (fromWindow) return String(fromWindow);
  const tg = (window as any).Telegram?.WebApp;
  const fromTg = tg?.initDataUnsafe?.user?.id ?? (tg?.initData ? parseTelegramIdFromInitData(tg.initData) : null);
  if (fromTg != null) return String(fromTg);
  return null;
}

function parseTelegramIdFromInitData(initData: string): number | null {
  try {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (userParam) {
      const user = JSON.parse(decodeURIComponent(userParam));
      return user?.id ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function setLangCookie(lang: Language) {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANG_COOKIE_NAME}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
}

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
  const [isLanguageResolved, setIsLanguageResolved] = useState(() => {
    if (typeof window === 'undefined') return true;
    const path = window.location.pathname;
    const hasLangPath = path.startsWith('/uk') || path.startsWith('/ru');
    const telegramId = getTelegramIdSync() || userTelegramId;
    return !hasLangPath || !telegramId;
  });

  useEffect(() => {
    const loadLanguageFromDB = async () => {
      if (typeof window === 'undefined') return;
      const telegramId = userTelegramId || (window as any).__userTelegramId || getTelegramIdSync();
      const urlParams = new URLSearchParams(window.location.search);
      const telegramIdFromUrl = urlParams.get('telegramId');
      const finalTelegramId = telegramId?.toString() ?? telegramIdFromUrl ?? null;
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
              setLangCookie(dbLang);
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
          setIsLanguageResolved(true);
        }
      } else {
        setIsLanguageResolved(true);
      }
    };

    const telegramId = getTelegramIdSync() || userTelegramId;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasTelegramId = !!telegramId || !!urlParams?.get('telegramId');
    const delay = hasTelegramId ? 0 : 300;
    const timer = setTimeout(loadLanguageFromDB, delay);

    const checkInterval = setInterval(() => {
      if ((window as any).__userTelegramId && !userTelegramId) {
        loadLanguageFromDB();
        clearInterval(checkInterval);
      }
    }, 400);

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
    if (typeof window !== 'undefined' && !isLoadingLanguage) {
      localStorage.setItem('language', language);
      setLangCookie(language);
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
      {!isLanguageResolved ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100dvh',
          fontSize: 18,
          color: '#666',
        }}>
          Завантаження… / Загрузка…
        </div>
      ) : (
        children
      )}
    </LanguageContext.Provider>
  );
};


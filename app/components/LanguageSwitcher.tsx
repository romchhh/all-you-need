'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, ChevronDown } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface LanguageSwitcherProps {
  tg?: TelegramWebApp | null;
  fullWidth?: boolean;
}

export const LanguageSwitcher = ({ tg, fullWidth = false }: LanguageSwitcherProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { profile } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(language);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  // Синхронізуємо локальний стан з контекстом
  useEffect(() => {
    setCurrentLang(language);
  }, [language]);

  const handleLanguageChange = useCallback(async (newLang: 'uk' | 'ru') => {
    setIsOpen(false);
    setLanguage(newLang);
    tg?.HapticFeedback.impactOccurred('light');

    // Зберігаємо мову в БД якщо є профіль
    if (profile?.telegramId) {
      try {
        await fetch('/api/user/language', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telegramId: profile.telegramId,
            language: newLang,
          }),
        });
      } catch (error) {
        console.error('Failed to save language to database:', error);
      }
    }

    // Оновлюємо URL з навігацією для перерендеру сторінки
    if (typeof window !== 'undefined') {
      const currentPath = pathname || window.location.pathname;
      let newPath = '';
      
      if (currentPath.startsWith('/uk') || currentPath.startsWith('/ru')) {
        // Замінюємо префікс мови
        newPath = `/${newLang}${currentPath.slice(3)}`;
      } else if (currentPath === '/' || currentPath === '') {
        // Головна сторінка
        newPath = `/${newLang}`;
      } else {
        // Інші шляхи
        newPath = `/${newLang}${currentPath}`;
      }
      
      // Використовуємо router.push для навігації, що викличе перерендер сторінки
      router.push(newPath);
    }
  }, [setLanguage, profile?.telegramId, tg, pathname, router]);

  // Оновлюємо позицію меню при відкритті
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      if (fullWidth) {
        setMenuPosition({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      } else {
        // Відцентровуємо меню відносно кнопки
        const menuWidth = 160; // Ширина меню
        const left = rect.left + (rect.width / 2) - (menuWidth / 2);
        // Перевіряємо, щоб меню не виходило за межі екрану
        const adjustedLeft = Math.max(16, Math.min(left, window.innerWidth - menuWidth - 16));
        
        setMenuPosition({
          top: rect.bottom + 8,
          left: adjustedLeft,
          width: menuWidth
        });
      }
    }
  }, [isOpen, fullWidth]);

  // Закриваємо меню при кліку поза ним
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (buttonRef.current && !buttonRef.current.contains(target)) {
        // Перевіряємо, чи клік не був на елементі меню
        const menuElement = document.getElementById('language-menu');
        if (menuElement && !menuElement.contains(target)) {
          setIsOpen(false);
        }
      }
    };

    // Використовуємо затримку, щоб клік на кнопку всередині меню спрацював
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as any);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as any);
    };
  }, [isOpen]);

  const getLanguageLabel = () => {
    return currentLang === 'uk' ? 'Українська' : 'Русский';
  };

  if (fullWidth) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(prev => !prev);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="w-full bg-transparent border border-white/20 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Globe size={20} className="text-white/70" />
            <span className="text-white font-medium">{t('common.language')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/70 font-medium text-sm">{getLanguageLabel()}</span>
            <ChevronDown size={16} className={`text-white/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* Backdrop */}
        {isOpen && (
          <div 
            className="fixed inset-0 z-[9999]"
            onClick={() => setIsOpen(false)}
          />
        )}

        {/* Випадаюче меню */}
        {isOpen && (
          <div 
            id="language-menu"
            className="fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] overflow-hidden"
            style={{
              top: `${menuPosition.top + 8}px`,
              left: `${menuPosition.left}px`,
              width: `${menuPosition.width}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLanguageChange('uk');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
                currentLang === 'uk'
                  ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <span className="text-sm">Українська</span>
              {currentLang === 'uk' && <span className="text-[#D3F1A7]">✓</span>}
            </button>
            <div className="h-px bg-white/10"></div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLanguageChange('ru');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
                currentLang === 'ru'
                  ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              <span className="text-sm">Русский</span>
              {currentLang === 'ru' && <span className="text-[#D3F1A7]">✓</span>}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
          tg?.HapticFeedback.impactOccurred('light');
        }}
        className={`p-2.5 rounded-xl transition-all duration-200 ${
          isOpen
            ? 'bg-blue-100'
            : 'bg-gray-100 hover:bg-gray-200'
        }`}
      >
        <Globe size={20} className="text-gray-900" />
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9999]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Випадаюче меню як portal */}
      {isOpen && (
        <div 
          id="language-menu"
          className="fixed bg-white rounded-xl border border-gray-200 shadow-2xl z-[10000] overflow-hidden"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            width: `${menuPosition.width}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLanguageChange('uk');
            }}
            className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
              currentLang === 'uk'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm">Українська</span>
            {currentLang === 'uk' && <span className="text-blue-500">✓</span>}
          </button>
          <div className="h-px bg-gray-200"></div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLanguageChange('ru');
            }}
            className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
              currentLang === 'ru'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm">Русский</span>
            {currentLang === 'ru' && <span className="text-blue-500">✓</span>}
          </button>
        </div>
      )}
    </>
  );
};



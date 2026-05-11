'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { Globe, ChevronDown } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';

interface LanguageSwitcherProps {
  tg?: TelegramWebApp | null;
  fullWidth?: boolean;
}

export const LanguageSwitcher = ({ tg, fullWidth = false }: LanguageSwitcherProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { isLight } = useTheme();
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

  const fwBtn = isLight
    ? 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between shadow-sm transition-colors hover:bg-gray-50'
    : 'w-full bg-transparent border border-white/20 rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/10 transition-colors';
  const fwGlobe = isLight ? 'text-gray-500' : 'text-white/70';
  const fwLabel = isLight ? 'text-gray-900 font-medium' : 'text-white font-medium';
  const fwValue = isLight ? 'text-gray-600 font-medium text-sm' : 'text-white/70 font-medium text-sm';
  const fwMenu = isLight
    ? 'fixed rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 z-[10000] overflow-hidden'
    : 'fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] overflow-hidden';
  const fwItemActive = isLight
    ? 'bg-[#3F5331]/30 text-[#2d3d24] font-semibold'
    : 'bg-[#3F5331]/20 text-[#C8E6A0] font-semibold';
  const fwItemIdle = isLight
    ? 'text-gray-800 hover:bg-gray-50'
    : 'text-white hover:bg-white/10';
  const fwCheck = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const fwDivider = isLight ? 'h-px bg-gray-200' : 'h-px bg-white/10';

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
          className={fwBtn}
        >
          <div className="flex items-center gap-3">
            <Globe size={20} className={fwGlobe} />
            <span className={fwLabel}>{t('common.language')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={fwValue}>{getLanguageLabel()}</span>
            <ChevronDown size={16} className={`${fwGlobe} transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
            className={fwMenu}
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
                currentLang === 'uk' ? fwItemActive : fwItemIdle
              }`}
            >
              <span className="text-sm">Українська</span>
              {currentLang === 'uk' && <span className={fwCheck}>✓</span>}
            </button>
            <div className={fwDivider} />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLanguageChange('ru');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
                currentLang === 'ru' ? fwItemActive : fwItemIdle
              }`}
            >
              <span className="text-sm">Русский</span>
              {currentLang === 'ru' && <span className={fwCheck}>✓</span>}
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
          isLight
            ? isOpen
              ? 'bg-[#3F5331]/40 ring-1 ring-[#3F5331]/20'
              : 'bg-gray-100 hover:bg-gray-200'
            : isOpen
              ? 'bg-white/15 ring-1 ring-white/30'
              : 'bg-white/10 hover:bg-white/15'
        }`}
      >
        <Globe size={20} className={isLight ? 'text-gray-900' : 'text-white'} />
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
          className={
            isLight
              ? 'fixed rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10 z-[10000] overflow-hidden'
              : 'fixed rounded-xl border border-white/20 bg-[#1C1C1C] shadow-2xl z-[10000] overflow-hidden'
          }
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
                ? isLight
                  ? 'bg-[#3F5331]/30 text-[#2d3d24] font-semibold'
                  : 'bg-[#3F5331]/20 text-[#C8E6A0] font-semibold'
                : isLight
                  ? 'text-gray-700 hover:bg-gray-50'
                  : 'text-white hover:bg-white/10'
            }`}
          >
            <span className="text-sm">Українська</span>
            {currentLang === 'uk' && (
              <span className={isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}>✓</span>
            )}
          </button>
          <div className={isLight ? 'h-px bg-gray-200' : 'h-px bg-white/10'} />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleLanguageChange('ru');
            }}
            className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-center gap-2 ${
              currentLang === 'ru'
                ? isLight
                  ? 'bg-[#3F5331]/30 text-[#2d3d24] font-semibold'
                  : 'bg-[#3F5331]/20 text-[#C8E6A0] font-semibold'
                : isLight
                  ? 'text-gray-700 hover:bg-gray-50'
                  : 'text-white hover:bg-white/10'
            }`}
          >
            <span className="text-sm">Русский</span>
            {currentLang === 'ru' && (
              <span className={isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}>✓</span>
            )}
          </button>
        </div>
      )}
    </>
  );
};



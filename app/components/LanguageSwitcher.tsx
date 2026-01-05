'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { Globe } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useUser } from '@/hooks/useUser';
import { useState, useRef, useEffect } from 'react';

interface LanguageSwitcherProps {
  tg?: TelegramWebApp | null;
}

export const LanguageSwitcher = ({ tg }: LanguageSwitcherProps) => {
  const { language, setLanguage, t } = useLanguage();
  const { profile } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLanguageChange = async (newLang: 'uk' | 'ru') => {
    setLanguage(newLang);
    setIsOpen(false);
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
  };

  // Закриваємо меню при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
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

      {/* Випадаюче меню */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-50 min-w-[120px] overflow-hidden">
          <button
            onClick={() => handleLanguageChange('uk')}
            className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
              language === 'uk'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm">🇺🇦 УК</span>
          </button>
          <div className="h-px bg-gray-200"></div>
          <button
            onClick={() => handleLanguageChange('ru')}
            className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
              language === 'ru'
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-sm">🇷🇺 RU</span>
          </button>
        </div>
      )}
    </div>
  );
};



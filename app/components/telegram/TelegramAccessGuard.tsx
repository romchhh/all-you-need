'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface TelegramAccessGuardProps {
  children: React.ReactNode;
}

const translations = {
  uk: {
    loading: 'Завантаження...',
    accessRestricted: 'Доступ обмежено',
    message: 'TradeGround Marketplace доступний тільки через Telegram міні-додаток. Будь ласка, відкрийте додаток через бота в Telegram.',
    howToOpen: 'Як відкрити:',
    step1: 'Відкрийте Telegram',
    step2: 'Знайдіть бота',
    step3: 'Натисніть кнопку "Відкрити маркетплейс"',
    openInTelegram: 'Відкрити в Telegram',
  },
  ru: {
    loading: 'Загрузка...',
    accessRestricted: 'Доступ ограничен',
    message: 'TradeGround Marketplace доступен только через Telegram мини-приложение. Пожалуйста, откройте приложение через бота в Telegram.',
    howToOpen: 'Как открыть:',
    step1: 'Откройте Telegram',
    step2: 'Найдите бота',
    step3: 'Нажмите кнопку "Открыть маркетплейс"',
    openInTelegram: 'Открыть в Telegram',
  },
};

const isDev = process.env.NODE_ENV !== 'production';

export function TelegramAccessGuard({ children }: TelegramAccessGuardProps) {
  const pathname = usePathname();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [lang, setLang] = useState<'uk' | 'ru'>('uk');

  useEffect(() => {
    if (pathname?.startsWith('/ru')) {
      setLang('ru');
    } else if (pathname?.startsWith('/uk')) {
      setLang('uk');
    }

    if (pathname?.startsWith('/admin')) {
      setIsChecking(false);
      setIsBlocked(false);
      return;
    }

    const telegramOnlyMode = process.env.NEXT_PUBLIC_MARKETPLACE_TELEGRAM_ONLY === 'true';

    if (!telegramOnlyMode) {
      setIsChecking(false);
      setIsBlocked(false);
      return;
    }

    validateTelegramAccess();
  }, [pathname]);

  const validateTelegramAccess = async () => {
    try {
      const cachedValidation = sessionStorage.getItem('telegram_validated');
      if (cachedValidation === 'true') {
        setIsBlocked(false);
        setIsChecking(false);
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const telegramIdFromUrl = urlParams.get('telegramId');

      if (telegramIdFromUrl) {
        if (window.Telegram?.WebApp) {
          sessionStorage.setItem('telegram_validated', 'true');
          sessionStorage.setItem('telegramId', telegramIdFromUrl);
          setIsBlocked(false);
          setIsChecking(false);
          return;
        }
        setIsBlocked(true);
        setIsChecking(false);
        return;
      }

      const waitForTelegram = async (maxAttempts = 15): Promise<boolean> => {
        for (let i = 0; i < maxAttempts; i++) {
          if (window.Telegram?.WebApp?.initData) {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return false;
      };

      const telegramReady = await waitForTelegram();

      if (!telegramReady || !window.Telegram?.WebApp) {
        setIsBlocked(true);
        setIsChecking(false);
        return;
      }

      const tg = window.Telegram.WebApp;

      if (tg.ready) {
        tg.ready();
      }

      const initData = tg.initData;

      if (!initData || initData.length === 0) {
        setIsBlocked(true);
        setIsChecking(false);
        return;
      }

      const response = await fetch('/api/auth/validate-telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      const data = await response.json();

      if (data.valid) {
        sessionStorage.setItem('telegram_validated', 'true');
        setIsBlocked(false);
      } else {
        if (isDev) console.error('[TelegramAccessGuard] Validation failed:', data.error);
        setIsBlocked(true);
      }
    } catch (error) {
      if (isDev) console.error('[TelegramAccessGuard] Validation error:', error);
      setIsBlocked(true);
    } finally {
      setIsChecking(false);
    }
  };

  const t = translations[lang];

  // Під час перевірки показуємо шелл одразу — без fullscreen spinner
  if (isChecking) {
    return <>{children}</>;
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">{t.accessRestricted}</h1>

          <p className="text-gray-600 mb-6 leading-relaxed">{t.message}</p>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 font-medium mb-2">{t.howToOpen}</p>
            <ol className="text-sm text-blue-700 text-left space-y-2">
              <li className="flex items-start">
                <span className="font-bold mr-2">1.</span>
                <span>{t.step1}</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">2.</span>
                <span>
                  {t.step2} @{process.env.NEXT_PUBLIC_BOT_USERNAME || 'tradeground_bot'}
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">3.</span>
                <span>{t.step3}</span>
              </li>
            </ol>
          </div>

          <a
            href={`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'tradeground_bot'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z" />
            </svg>
            {t.openInTelegram}
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

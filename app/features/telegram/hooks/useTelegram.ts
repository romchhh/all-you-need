import { useState, useEffect } from 'react';
import { TelegramWebApp } from '@/types/telegram';
import { ensureTelegramViewportFullscreen } from '@/lib/telegram/telegramViewport';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

const isDev = process.env.NODE_ENV !== 'production';

export const useTelegram = () => {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const telegram = window.Telegram.WebApp;

      ensureTelegramViewportFullscreen();

      // Приховуємо основну кнопку
      telegram.MainButton.hide();

      // Налаштування для повноекранного режиму з можливістю згортання
      telegram.backgroundColor = '#ffffff';
      telegram.headerColor = '#ffffff';

      // Налаштування viewport
      const updateViewport = () => {
        if (telegram.viewportStableHeight) {
          document.documentElement.style.setProperty('--tg-viewport-height', `${telegram.viewportStableHeight}px`);
          document.body.style.minHeight = `${telegram.viewportStableHeight}px`;
        }
      };

      if (telegram.onEvent) {
        telegram.onEvent('viewportChanged', updateViewport);
      }

      updateViewport();

      const handleResize = () => updateViewport();
      window.addEventListener('resize', handleResize);

      if (telegram.enableClosingConfirmation) {
        telegram.enableClosingConfirmation();
      }

      setTg(telegram);

      // Отримуємо дані користувача з initDataUnsafe
      const initData = telegram.initDataUnsafe;

      if (initData?.user) {
        const telegramUser = initData.user;
        setUser(telegramUser);

        if (typeof window !== 'undefined') {
          sessionStorage.setItem('telegramId', telegramUser.id.toString());
        }

        updateProfileFromTelegram(telegramUser).catch(err => {
          if (isDev) console.error('Error updating profile from Telegram:', err);
        });
      } else {
        const initDataString = telegram.initData;

        if (initDataString && initDataString.length > 0) {
          const telegramId = parseTelegramIdFromInitData(initDataString);
          if (telegramId) {
            setUser({ id: telegramId, first_name: '' });

            if (typeof window !== 'undefined') {
              sessionStorage.setItem('telegramId', telegramId.toString());
            }
          } else if (isDev) {
            console.error('Could not parse telegramId from initData string');
          }
        }
      }

      return () => {
        window.removeEventListener('resize', handleResize);
        if (telegram.offEvent) {
          telegram.offEvent('viewportChanged', updateViewport);
        }
      };
    } else if (isDev) {
      console.warn('Telegram WebApp not available (normal in browser testing)');
    }
  }, []);

  return { tg, user };
};

function parseTelegramIdFromInitData(initData: string): number | null {
  try {
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (userParam) {
      const user = JSON.parse(decodeURIComponent(userParam));
      return user.id || null;
    }
  } catch (error) {
    if (isDev) console.error('Error parsing initData:', error);
  }
  return null;
}

let lastTelegramProfileSyncAt = 0;
let lastTelegramProfileSyncUserId = 0;

async function updateProfileFromTelegram(telegramUser: any) {
  const now = Date.now();
  if (
    telegramUser?.id === lastTelegramProfileSyncUserId &&
    now - lastTelegramProfileSyncAt < 3500
  ) {
    return;
  }
  lastTelegramProfileSyncUserId = telegramUser?.id ?? 0;
  lastTelegramProfileSyncAt = now;

  try {
    const response = await fetch('/api/user/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        photoUrl: telegramUser.photo_url,
      }),
    });

    if (response.status === 404) {
      return;
    }
    if (!response.ok) {
      const errorText = await response.text();
      if (isDev) console.error('Failed to update profile:', response.status, errorText);
    }
  } catch (error) {
    if (isDev) console.error('Error updating profile:', error);
  }
}

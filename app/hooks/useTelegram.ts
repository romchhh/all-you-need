import { useState, useEffect } from 'react';
import { TelegramWebApp } from '@/types/telegram';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export const useTelegram = () => {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      const telegram = window.Telegram.WebApp;
      telegram.ready();
      telegram.expand();
      telegram.MainButton.hide();
      setTg(telegram);

      // Отримуємо дані користувача з initDataUnsafe
      const initData = telegram.initDataUnsafe;
      console.log('Telegram initData:', initData);
      
      if (initData?.user) {
        const telegramUser = initData.user;
        console.log('Telegram user data:', telegramUser);
        setUser(telegramUser);

        // Оновлюємо профіль в БД (якщо є нові дані) - але не блокуємо завантаження
        updateProfileFromTelegram(telegramUser).catch(err => {
          console.error('Error updating profile from Telegram:', err);
        });
      } else {
        console.warn('No user data in initDataUnsafe, trying to parse initData string');
        // Спробуємо отримати telegramId з initData рядка
        const initDataString = telegram.initData;
        if (initDataString) {
          const telegramId = parseTelegramIdFromInitData(initDataString);
          if (telegramId) {
            console.log('Parsed telegramId from initData:', telegramId);
            // Створюємо мінімальний об'єкт користувача для завантаження профілю
            setUser({ id: telegramId, first_name: '' });
          } else {
            console.error('Could not parse telegramId from initData string');
          }
        } else {
          console.error('No initData string available');
        }
      }
    } else {
      console.warn('Telegram WebApp not available');
    }
  }, []);

  return { tg, user };
};

// Парсинг telegramId з initData рядка
function parseTelegramIdFromInitData(initData: string): number | null {
  try {
    // initData має формат: user=%7B%22id%22%3A123456789%2C... (URL encoded JSON)
    const params = new URLSearchParams(initData);
    const userParam = params.get('user');
    if (userParam) {
      const user = JSON.parse(decodeURIComponent(userParam));
      return user.id || null;
    }
  } catch (error) {
    console.error('Error parsing initData:', error);
  }
  return null;
}

// Оновлення профілю в БД з даних Telegram (якщо є нові дані)
async function updateProfileFromTelegram(telegramUser: any) {
  try {
    console.log('Updating profile from Telegram data:', {
      telegramId: telegramUser.id,
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      photoUrl: telegramUser.photo_url,
    });

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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update profile:', response.status, errorText);
    } else {
      const data = await response.json();
      console.log('Profile updated successfully:', data);
    }
  } catch (error) {
    console.error('Error updating profile:', error);
  }
}


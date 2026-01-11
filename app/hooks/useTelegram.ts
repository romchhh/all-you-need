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
    console.log('=== useTelegram: Initializing ===');
    console.log('window.Telegram:', typeof window !== 'undefined' ? window.Telegram : 'undefined');
    console.log('window.Telegram.WebApp:', typeof window !== 'undefined' ? window.Telegram?.WebApp : 'undefined');
    
    if (window.Telegram?.WebApp) {
      const telegram = window.Telegram.WebApp;
      
      console.log('=== Telegram WebApp found ===');
      console.log('Platform:', telegram.platform);
      console.log('Version:', telegram.version);
      console.log('initData (raw string):', telegram.initData);
      console.log('initData length:', telegram.initData?.length || 0);
      console.log('initDataUnsafe (full):', telegram.initDataUnsafe);
      console.log('initDataUnsafe.user:', telegram.initDataUnsafe?.user);
      
      // Викликаємо ready() першим
      telegram.ready();
      console.log('✅ telegram.ready() called');
      
      // Розгортаємо на весь екран
      telegram.expand();
      console.log('✅ telegram.expand() called');
      
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
      console.log('=== Processing initDataUnsafe ===');
      console.log('initDataUnsafe object:', JSON.stringify(initData, null, 2));
      
      if (initData?.user) {
        const telegramUser = initData.user;
        console.log('✅ User data found in initDataUnsafe:');
        console.log('  - ID:', telegramUser.id);
        console.log('  - Username:', telegramUser.username);
        console.log('  - First name:', telegramUser.first_name);
        console.log('  - Last name:', telegramUser.last_name);
        console.log('  - Language:', telegramUser.language_code);
        
        setUser(telegramUser);

        // Зберігаємо telegramId в sessionStorage для використання в інших хуках
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('telegramId', telegramUser.id.toString());
          console.log('✅ telegramId saved to sessionStorage:', telegramUser.id);
        }

        // Оновлюємо профіль в БД
        updateProfileFromTelegram(telegramUser).catch(err => {
          console.error('Error updating profile from Telegram:', err);
        });
      } else {
        console.warn('❌ No user data in initDataUnsafe');
        console.log('Trying to parse initData string...');
        
        // Спробуємо отримати telegramId з initData рядка
        const initDataString = telegram.initData;
        console.log('initData string:', initDataString);
        
        if (initDataString && initDataString.length > 0) {
          const telegramId = parseTelegramIdFromInitData(initDataString);
          if (telegramId) {
            console.log('✅ Parsed telegramId from initData string:', telegramId);
            setUser({ id: telegramId, first_name: '' });
            
            // Зберігаємо telegramId в sessionStorage
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('telegramId', telegramId.toString());
              console.log('✅ telegramId saved to sessionStorage:', telegramId);
            }
          } else {
            console.error('❌ Could not parse telegramId from initData string');
            console.log('initData string content:', initDataString.substring(0, 200));
          }
        } else {
          // Це нормально, якщо telegramId передається через URL
          console.warn('⚠️ initData string is empty or not available');
          console.warn('This is OK if telegramId is passed via URL parameter');
          console.warn('If opened through bot button, initData should be available');
        }
      }
      
      // Cleanup function
      return () => {
        window.removeEventListener('resize', handleResize);
        if (telegram.offEvent) {
          telegram.offEvent('viewportChanged', updateViewport);
        }
      };
    } else {
      console.error('❌ Telegram WebApp NOT available');
      console.error('window.Telegram:', typeof window !== 'undefined' ? window.Telegram : 'undefined');
      console.error('This is normal if opened in regular browser for testing');
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


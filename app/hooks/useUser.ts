import { useState, useEffect } from 'react';
import { useTelegram } from './useTelegram';

interface UserProfile {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatar: string | null;
  balance: number;
  rating: number;
  reviewsCount: number;
  createdAt: string;
}

// Функція парсингу telegramId з initData рядка
function parseTelegramIdFromInitData(initData: string): number | null {
  try {
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

export const useUser = () => {
  const { tg, user: telegramUser } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTelegramId, setCurrentTelegramId] = useState<number | null>(null);

  useEffect(() => {
    // Завжди намагаємося отримати telegramId
    let telegramId: number | null = null;
    
    console.log('useUser useEffect - telegramUser:', telegramUser);
    
    // Спочатку перевіряємо URL параметри
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const telegramIdFromUrl = urlParams.get('telegramId');
      if (telegramIdFromUrl) {
        telegramId = parseInt(telegramIdFromUrl, 10);
        console.log('Got telegramId from URL parameter:', telegramId);
      }
    }
    
    // Якщо не знайшли в URL, шукаємо в telegramUser
    if (!telegramId && telegramUser?.id) {
      telegramId = telegramUser.id;
      console.log('Got telegramId from telegramUser:', telegramId);
    }
    
    // Якщо все ще не знайшли, шукаємо в initData
    if (!telegramId && typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const initData = window.Telegram.WebApp.initDataUnsafe;
      console.log('initDataUnsafe:', initData);
      
      if (initData?.user?.id) {
        telegramId = initData.user.id;
        console.log('Got telegramId from initDataUnsafe:', telegramId);
      } else {
        // Спробуємо розпарсити з initData рядка
        const initDataString = window.Telegram.WebApp.initData;
        console.log('initData string:', initDataString);
        
        if (initDataString) {
          telegramId = parseTelegramIdFromInitData(initDataString);
          console.log('Parsed telegramId from initData string:', telegramId);
        }
      }
    }
    
    if (telegramId) {
      console.log('Fetching profile for telegramId:', telegramId);
      setCurrentTelegramId(telegramId);
      fetchProfile(telegramId);
    } else {
      console.warn('Could not determine telegramId, profile will not be loaded');
      console.warn('Available data:', {
        telegramUser,
        hasWindow: typeof window !== 'undefined',
        hasTelegram: typeof window !== 'undefined' && !!window.Telegram?.WebApp,
        initDataUnsafe: typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe : null,
        urlParams: typeof window !== 'undefined' ? window.location.search : null,
      });
      setLoading(false);
    }
  }, [telegramUser]);

  const fetchProfile = async (telegramId: number) => {
    try {
      console.log('Fetching profile for telegramId:', telegramId);
      const response = await fetch(`/api/user/profile?telegramId=${telegramId}`);
      console.log('Profile fetch response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Profile data received:', data);
        setProfile(data);
      } else if (response.status === 404) {
        // Користувач не знайдений - спробуємо створити профіль з даних Telegram
        console.log('User not found, trying to create profile from Telegram data');
        const errorText = await response.text();
        console.error('User not found:', errorText);
        
        // Спробуємо створити профіль з даних Telegram
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
          const initData = window.Telegram.WebApp.initDataUnsafe;
          if (initData?.user) {
            const telegramUser = initData.user;
            console.log('Creating profile from Telegram data:', telegramUser);
            
            // Викликаємо POST для створення профілю
            const createResponse = await fetch('/api/user/profile', {
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
            
            if (createResponse.ok) {
              const newProfile = await createResponse.json();
              console.log('Profile created successfully:', newProfile);
              setProfile(newProfile);
            } else {
              const createError = await createResponse.text();
              console.error('Failed to create profile:', createError);
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch profile:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const refetch = async () => {
    const telegramId = currentTelegramId || telegramUser?.id;
    if (telegramId) {
      setLoading(true);
      await fetchProfile(telegramId);
    }
  };

  return { profile, loading, refetch };
};


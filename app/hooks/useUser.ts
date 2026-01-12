import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
  listingPackagesBalance: number;
  rating: number;
  reviewsCount: number;
  createdAt: string;
}

// Глобальне сховище для telegramId
let globalTelegramId: number | null = null;

if (typeof window !== 'undefined') {
  const stored = sessionStorage.getItem('telegramId');
  if (stored) {
    globalTelegramId = parseInt(stored, 10);
  }
}

export const useUser = () => {
  const { user: telegramUser } = useTelegram();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTelegramId, setCurrentTelegramId] = useState<number | null>(null);

  useEffect(() => {
    const getTelegramId = (): number | null => {
      console.log('=== useUser: Getting telegramId ===');
      
      // 1. useTelegram hook (пріоритет - дані з Telegram WebApp)
      if (telegramUser?.id) {
        console.log('✅ telegramId from useTelegram hook:', telegramUser.id);
        return telegramUser.id;
      }
      
      // 2. initData (прямий доступ до Telegram WebApp)
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        const id = window.Telegram.WebApp.initDataUnsafe.user.id;
        console.log('✅ telegramId from initDataUnsafe:', id);
        return id;
      }
      
      // 3. sessionStorage (збережений з попереднього відкриття)
      if (globalTelegramId) {
        console.log('✅ telegramId from sessionStorage:', globalTelegramId);
        return globalTelegramId;
      }
      
      // 4. URL параметр (останній варіант, fallback)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const telegramIdFromUrl = urlParams.get('telegramId');
        if (telegramIdFromUrl) {
          const id = parseInt(telegramIdFromUrl, 10);
          if (!isNaN(id)) {
            console.log('✅ telegramId from URL parameter:', id);
            return id;
          }
        }
      }
      
      console.warn('❌ No telegramId found in any source');
      return null;
    };
    
    const telegramId = getTelegramId();
    
    if (telegramId) {
      // Зберігаємо
      if (globalTelegramId !== telegramId) {
        globalTelegramId = telegramId;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('telegramId', telegramId.toString());
        }
      }
      
      // Завантажуємо профіль
      if (currentTelegramId !== telegramId) {
        setCurrentTelegramId(telegramId);
        fetchProfile(telegramId);
      }
    } else {
      setLoading(false);
    }
  }, [telegramUser, currentTelegramId, pathname, searchParams]);

  const fetchProfile = async (telegramId: number) => {
    try {
      // Оновлюємо активність користувача
      try {
        await fetch('/api/user/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId }),
        });
      } catch (err) {
        // Тиха обробка помилок оновлення активності
      }

      const response = await fetch(`/api/user/profile?telegramId=${telegramId}`);
      
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      } else if (response.status === 404) {
        let telegramUser: any = null;
        if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
          telegramUser = window.Telegram.WebApp.initDataUnsafe.user;
        } else {
          telegramUser = {
            id: telegramId,
            first_name: 'User',
            last_name: '',
            username: null,
            photo_url: null
          };
        }
        
        const createResponse = await fetch('/api/user/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId: telegramUser.id || telegramId,
            username: telegramUser.username || null,
            firstName: telegramUser.first_name || 'User',
            lastName: telegramUser.last_name || '',
            photoUrl: telegramUser.photo_url || null,
          }),
        });
        
        if (createResponse.ok) {
          const newProfile = await createResponse.json();
          setProfile(newProfile);
        }
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


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
      // 1. URL параметр
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const telegramIdFromUrl = urlParams.get('telegramId');
        if (telegramIdFromUrl) {
          const id = parseInt(telegramIdFromUrl, 10);
          if (!isNaN(id)) return id;
        }
      }
      
      // 2. initData
      if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
        return window.Telegram.WebApp.initDataUnsafe.user.id;
      }
      
      // 3. useTelegram hook
      if (telegramUser?.id) {
        return telegramUser.id;
      }
      
      // 4. sessionStorage
      if (globalTelegramId) {
        return globalTelegramId;
      }
      
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


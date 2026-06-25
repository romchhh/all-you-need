import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { loadProfileBundle } from '@/utils/loadProfileBundle';

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
  agreementAccepted?: boolean;
  createdAt: string;
}

interface UserDashboardStats {
  totalListings: number;
  totalViews: number;
  soldListings: number;
  activeListings: number;
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
  const [dashboardStats, setDashboardStats] = useState<UserDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [currentTelegramId, setCurrentTelegramId] = useState<number | null>(null);

  const isProfilePage = pathname?.includes('/profile') ?? false;

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
        fetchProfile(telegramId, isProfilePage);
      }
    } else {
      setLoading(false);
    }
  }, [telegramUser, currentTelegramId, pathname, searchParams, isProfilePage]);

  const fetchProfile = async (telegramId: number, includeStats = false) => {
    try {
      const expand = includeStats ? 'language,stats' : 'language';
      const { res, data } = await loadProfileBundle(telegramId, expand);

      if (res.ok) {
        const raw = data as unknown as UserProfile & {
          language?: string;
          stats?: UserDashboardStats;
        };
        const { language: _l, stats, ...rest } = raw;
        void _l;
        setProfile(rest as UserProfile);
        setDashboardStats(stats ?? null);
        setIsBlocked(false);
      } else if (res.status === 403) {
        setProfile(null);
        setDashboardStats(null);
        setIsBlocked(true);
      } else if (res.status === 404) {
        setIsBlocked(false);
        setProfile(null);
        setDashboardStats(null);
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
      await fetchProfile(telegramId, isProfilePage);
    }
  };

  const refetchStats = async () => {
    const telegramId = currentTelegramId || telegramUser?.id;
    if (!telegramId) return;
    try {
      const res = await fetch(`/api/user/stats?telegramId=${telegramId}`);
      if (res.ok) {
        const data = (await res.json()) as UserDashboardStats;
        setDashboardStats(data);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!isProfilePage || !profile?.telegramId || dashboardStats) return;
    void refetchStats();
  }, [isProfilePage, profile?.telegramId, dashboardStats]);

  // Є контекст Telegram у міні-апі (після першого циклу effect — currentTelegramId виставлений)
  const hasTelegramIdentity = currentTelegramId != null;

  const agreed = profile?.agreementAccepted === true;
  const hasContact = Boolean(profile?.phone?.trim() || profile?.username?.trim());

  // Реєстрація не завершена: немає запису профілю в БД або немає оферти / контакту (хоча б один: телефон або username)
  const isRegistrationIncomplete = Boolean(
    !loading &&
      hasTelegramIdentity &&
      (profile === null || !agreed || !hasContact)
  );

  return { profile, dashboardStats, loading, refetch, refetchStats, isBlocked, isRegistrationIncomplete };
};


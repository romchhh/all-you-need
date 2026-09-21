'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ProfileViewMode } from '@/components/business/ProfileModeSwitcher';

type ProfileViewModeContextValue = {
  mode: ProfileViewMode;
  setMode: (mode: ProfileViewMode) => void;
  isBusinessActive: boolean;
  hasBusinessProfile: boolean;
  isBusinessSuspended: boolean;
  isReady: boolean;
  defaultListingProfileType: 'personal' | 'business';
  refreshBusinessStatus: () => Promise<void>;
};

const ProfileViewModeContext = createContext<ProfileViewModeContextValue | null>(null);

function storageKey(telegramId: string): string {
  return `profileViewMode:${telegramId}`;
}

function readStoredMode(telegramId: string): ProfileViewMode {
  if (typeof window === 'undefined') return 'personal';
  try {
    const raw = localStorage.getItem(storageKey(telegramId));
    return raw === 'business' ? 'business' : 'personal';
  } catch {
    return 'personal';
  }
}

function writeStoredMode(telegramId: string, mode: ProfileViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(telegramId), mode);
  } catch {
    // ignore quota / private mode
  }
}

function resolveTelegramId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromWindow = (window as Window & { __userTelegramId?: string }).__userTelegramId;
  if (fromWindow) return String(fromWindow);
  const fromSession = sessionStorage.getItem('telegramId');
  if (fromSession) return fromSession;
  const fromUrl = new URLSearchParams(window.location.search).get('telegramId');
  if (fromUrl) return fromUrl;
  const tg = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } } })
    .Telegram?.WebApp;
  const fromTg = tg?.initDataUnsafe?.user?.id;
  return fromTg != null ? String(fromTg) : null;
}

export function ProfileViewModeProvider({ children }: { children: ReactNode }) {
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [mode, setModeState] = useState<ProfileViewMode>('personal');
  const [isBusinessActive, setIsBusinessActive] = useState(false);
  const [hasBusinessProfile, setHasBusinessProfile] = useState(false);
  const [isBusinessSuspended, setIsBusinessSuspended] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const syncId = () => setTelegramId(resolveTelegramId());
    syncId();
    const timer = window.setInterval(syncId, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const refreshBusinessStatus = useCallback(async () => {
    if (!telegramId) {
      setIsBusinessActive(false);
      setHasBusinessProfile(false);
      setIsBusinessSuspended(false);
      setModeState('personal');
      setIsReady(true);
      return;
    }

    try {
      const res = await fetch(`/api/user/business-profile?telegramId=${encodeURIComponent(telegramId)}`);
      if (!res.ok) {
        setIsBusinessActive(false);
        setHasBusinessProfile(false);
        setIsBusinessSuspended(false);
        setModeState('personal');
        return;
      }

      const data = await res.json();
      const active = Boolean(data.isActive);
      const hasProfile = Boolean(data.hasProfile);
      const suspended = Boolean(data.isSuspended);

      setIsBusinessActive(active);
      setHasBusinessProfile(hasProfile);
      setIsBusinessSuspended(suspended);

      if (active) {
        setModeState(readStoredMode(telegramId));
      } else {
        setModeState('personal');
        writeStoredMode(telegramId, 'personal');
      }
    } catch {
      setIsBusinessActive(false);
      setHasBusinessProfile(false);
      setIsBusinessSuspended(false);
      setModeState('personal');
    } finally {
      setIsReady(true);
    }
  }, [telegramId]);

  useEffect(() => {
    setIsReady(false);
    void refreshBusinessStatus();
  }, [refreshBusinessStatus]);

  const setMode = useCallback(
    (next: ProfileViewMode) => {
      if (next === 'business' && !isBusinessActive) return;
      setModeState(next);
      if (telegramId) {
        writeStoredMode(telegramId, next);
      }
    },
    [isBusinessActive, telegramId]
  );

  const value = useMemo(
    () => ({
      mode: isBusinessActive ? mode : 'personal',
      setMode,
      isBusinessActive,
      hasBusinessProfile,
      isBusinessSuspended,
      isReady,
      defaultListingProfileType:
        isBusinessActive && mode === 'business' ? ('business' as const) : ('personal' as const),
      refreshBusinessStatus,
    }),
    [
      mode,
      setMode,
      isBusinessActive,
      hasBusinessProfile,
      isBusinessSuspended,
      isReady,
      refreshBusinessStatus,
    ]
  );

  return <ProfileViewModeContext.Provider value={value}>{children}</ProfileViewModeContext.Provider>;
}

export function useProfileViewMode(): ProfileViewModeContextValue {
  const ctx = useContext(ProfileViewModeContext);
  if (!ctx) {
    throw new Error('useProfileViewMode must be used within ProfileViewModeProvider');
  }
  return ctx;
}

export function useProfileViewModeOptional(): ProfileViewModeContextValue | null {
  return useContext(ProfileViewModeContext);
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

const DEFAULT_MIN_MS = 320;

const LOGO_SRC_DARK = '/images/Group%201000007086.svg';
const LOGO_SRC_LIGHT = '/images/Group-1000007086-light.svg';

type PageTransitionContextValue = {
  visible: boolean;
  show: (options?: { minMs?: number }) => void;
  hide: (options?: { minMs?: number }) => Promise<void>;
  /** Показати лоадер на час роботи; ховає з урахуванням minMs. */
  run: <T>(work: () => T | Promise<T>, options?: { minMs?: number }) => Promise<T>;
};

const PageTransitionContext = createContext<PageTransitionContextValue | null>(null);

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function PageTransitionOverlay({ visible }: { visible: boolean }) {
  const { isLight } = useTheme();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const logoSrc = isLight ? LOGO_SRC_LIGHT : LOGO_SRC_DARK;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[3000] flex items-center justify-center transition-opacity duration-200 ${
        isLight ? 'bg-white/72' : 'bg-black/70'
      } backdrop-blur-[3px]`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      <div className="flex flex-col items-center gap-4 px-6">
        <div
          className="flex h-36 w-36 items-center justify-center"
          style={{
            animation: 'tg-logo-spin 1.05s linear infinite',
            transformOrigin: 'center center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            width={408}
            height={129}
            className="h-12 w-auto max-w-[9.5rem] object-contain select-none pointer-events-none"
            draggable={false}
          />
        </div>
        <p
          className={`text-sm font-medium tracking-wide ${
            isLight ? 'text-gray-600' : 'text-white/75'
          }`}
        >
          {t('common.loading')}
        </p>
      </div>
    </div>,
    document.body
  );
}

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);
  const hideTokenRef = useRef(0);
  const minMsRef = useRef(DEFAULT_MIN_MS);

  useEffect(() => {
    if (!visible) return;
    const safety = window.setTimeout(() => {
      setVisible(false);
    }, 12000);
    return () => window.clearTimeout(safety);
  }, [visible]);

  const show = useCallback((options?: { minMs?: number }) => {
    minMsRef.current = options?.minMs ?? DEFAULT_MIN_MS;
    shownAtRef.current = Date.now();
    hideTokenRef.current += 1;
    setVisible(true);
  }, []);

  const hide = useCallback(async (options?: { minMs?: number }) => {
    const token = hideTokenRef.current;
    const minMs = options?.minMs ?? minMsRef.current;
    const elapsed = Date.now() - (shownAtRef.current || Date.now());
    const wait = Math.max(0, minMs - elapsed);
    if (wait > 0) await sleep(wait);
    if (token !== hideTokenRef.current) return;
    setVisible(false);
  }, []);

  const run = useCallback(
    async <T,>(work: () => T | Promise<T>, options?: { minMs?: number }) => {
      show(options);
      try {
        return await work();
      } finally {
        await hide(options);
      }
    },
    [show, hide]
  );

  const value = useMemo(
    () => ({ visible, show, hide, run }),
    [visible, show, hide, run]
  );

  return (
    <PageTransitionContext.Provider value={value}>
      {children}
      <PageTransitionOverlay visible={visible} />
    </PageTransitionContext.Provider>
  );
}

export function usePageTransition(): PageTransitionContextValue {
  const ctx = useContext(PageTransitionContext);
  if (!ctx) {
    return {
      visible: false,
      show: () => {},
      hide: async () => {},
      run: async (work) => work(),
    };
  }
  return ctx;
}

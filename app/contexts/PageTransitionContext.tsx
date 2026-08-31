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

/** Мінімальний час показу — лише для явних довгих операцій (run). */
const DEFAULT_MIN_MS = 0;

const LOGO_SRC_DARK = '/images/Group%201000007086.svg';
const LOGO_SRC_LIGHT = '/images/Group-1000007086-light.svg';

type ShowOptions = { minMs?: number; blocking?: boolean };

type PageTransitionActions = {
  show: (options?: ShowOptions) => void;
  hide: (options?: { minMs?: number }) => Promise<void>;
  run: <T>(work: () => T | Promise<T>, options?: ShowOptions) => Promise<T>;
};

type PageTransitionContextValue = PageTransitionActions & {
  visible: boolean;
};

const PageTransitionActionsContext = createContext<PageTransitionActions | null>(null);
const PageTransitionVisibleContext = createContext(false);

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
      className={`fixed inset-0 z-[3000] flex items-center justify-center pointer-events-none transition-opacity duration-150 ${
        isLight ? 'bg-white/85' : 'bg-black/80'
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t('common.loading')}
    >
      <div className="flex flex-col items-center gap-3 px-6">
        <div className="flex h-14 w-14 items-center justify-center animate-tg-logo-spin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            width={408}
            height={129}
            className="h-10 w-auto max-w-[8rem] object-contain select-none pointer-events-none"
            draggable={false}
          />
        </div>
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
    }, 8000);
    return () => window.clearTimeout(safety);
  }, [visible]);

  const show = useCallback((options?: ShowOptions) => {
    if (options?.blocking === false) return;
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
    async <T,>(work: () => T | Promise<T>, options?: ShowOptions) => {
      show({ ...options, blocking: true, minMs: options?.minMs ?? 180 });
      try {
        return await work();
      } finally {
        await hide({ minMs: options?.minMs ?? 180 });
      }
    },
    [show, hide]
  );

  const actions = useMemo<PageTransitionActions>(
    () => ({ show, hide, run }),
    [show, hide, run]
  );

  return (
    <PageTransitionActionsContext.Provider value={actions}>
      <PageTransitionVisibleContext.Provider value={visible}>
        {children}
        <PageTransitionOverlay visible={visible} />
      </PageTransitionVisibleContext.Provider>
    </PageTransitionActionsContext.Provider>
  );
}

export function usePageTransition(): PageTransitionContextValue {
  const actions = useContext(PageTransitionActionsContext);
  const visible = useContext(PageTransitionVisibleContext);
  if (!actions) {
    return {
      visible: false,
      show: () => {},
      hide: async () => {},
      run: async (work) => work(),
    };
  }
  return { ...actions, visible };
}

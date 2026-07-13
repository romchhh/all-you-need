'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { PageTransitionProvider } from '@/contexts/PageTransitionContext';
import { TelegramMiniAppViewport } from '@/components/telegram/TelegramMiniAppViewport';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PageTransitionProvider>
        <TelegramMiniAppViewport />
        {children}
      </PageTransitionProvider>
    </ThemeProvider>
  );
}

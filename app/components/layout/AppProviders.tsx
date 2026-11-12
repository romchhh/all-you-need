'use client';

import { Suspense } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ProfileViewModeProvider } from '@/contexts/ProfileViewModeContext';
import { PageTransitionProvider } from '@/contexts/PageTransitionContext';
import { TelegramMiniAppViewport } from '@/components/telegram/TelegramMiniAppViewport';
import { AppColdStart } from '@/components/layout/AppColdStart';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProfileViewModeProvider>
        <PageTransitionProvider>
          <TelegramMiniAppViewport />
          <Suspense fallback={null}>
            <AppColdStart />
          </Suspense>
          {children}
        </PageTransitionProvider>
      </ProfileViewModeProvider>
    </ThemeProvider>
  );
}

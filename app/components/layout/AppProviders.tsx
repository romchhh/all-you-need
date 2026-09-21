'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { ProfileViewModeProvider } from '@/contexts/ProfileViewModeContext';
import { PageTransitionProvider } from '@/contexts/PageTransitionContext';
import { TelegramMiniAppViewport } from '@/components/telegram/TelegramMiniAppViewport';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ProfileViewModeProvider>
        <PageTransitionProvider>
          <TelegramMiniAppViewport />
          {children}
        </PageTransitionProvider>
      </ProfileViewModeProvider>
    </ThemeProvider>
  );
}

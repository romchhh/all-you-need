'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { TelegramMiniAppViewport } from '@/components/TelegramMiniAppViewport';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TelegramMiniAppViewport />
      {children}
    </ThemeProvider>
  );
}

'use client';

import { ThemeProvider } from '@/contexts/ThemeContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

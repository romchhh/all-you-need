import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PerformanceScript } from "@/components/system/PerformanceScript";
import { MobileOptimizationScript } from "@/components/system/MobileOptimizationScript";
import { TelegramAccessGuard } from "@/components/telegram/TelegramAccessGuard";
import { RegistrationGate } from "@/components/telegram/RegistrationGate";
import { AppProviders } from "@/components/layout/AppProviders";
import { ListingMediaCacheScript } from "@/components/system/ListingMediaCacheScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Trade Ground Marketplace",
  description: "Marketplace for buying and selling",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Meta теги для Telegram WebApp */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Telegram WebApp — defer, щоб не блокувати parse HTML */}
        <script src="https://telegram.org/js/telegram-web-app.js" defer></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='appAppearanceTheme',t=localStorage.getItem(k);document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
        <ErrorBoundary>
          <LanguageProvider>
            <AppProviders>
              <PerformanceScript />
              <MobileOptimizationScript />
              <ListingMediaCacheScript />
              <TelegramAccessGuard>
                <RegistrationGate>
                  {children}
                </RegistrationGate>
              </TelegramAccessGuard>
            </AppProviders>
          </LanguageProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

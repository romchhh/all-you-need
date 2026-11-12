import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PerformanceScript } from "@/components/system/PerformanceScript";
import { MobileOptimizationScript } from "@/components/system/MobileOptimizationScript";
import { TelegramAccessGuard } from "@/components/telegram/TelegramAccessGuard";
import { StartParamDeepLink } from "@/components/telegram/StartParamDeepLink";
import { RegistrationGate } from "@/components/telegram/RegistrationGate";
import { AppProviders } from "@/components/layout/AppProviders";
import { ListingMediaCacheScript } from "@/components/system/ListingMediaCacheScript";

/**
 * Self-hosted Montserrat — next/font/google тягне fonts.googleapis.com під час
 * `next build` і ламає Docker на VPS без доступу до Google.
 */
const montserrat = localFont({
  src: [
    {
      path: "../fonts/montserrat-cyrillic-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/montserrat-cyrillic.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/montserrat-latin-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/montserrat-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-montserrat",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
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
      <body className={`${montserrat.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='appAppearanceTheme',t=localStorage.getItem(k);document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}try{var L=document.getElementById('app-boot-splash-logo');if(L){var th=document.documentElement.getAttribute('data-theme');L.src=th==='light'?'/images/Group-1000007086-light.svg':'/images/Group%201000007086.svg';}}catch(e2){}})();`,
          }}
        />
        {/* Cold-start splash до гідрації React (той самий вигляд, що page-transition) */}
        <div id="app-boot-splash" role="status" aria-live="polite" aria-busy="true">
          <div className="app-boot-splash-inner">
            <div className="app-boot-splash-logo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="app-boot-splash-logo"
                src="/images/Group%201000007086.svg"
                alt=""
                width={408}
                height={129}
                draggable={false}
              />
            </div>
            <p className="app-boot-splash-text">Завантаження...</p>
          </div>
        </div>
        <ErrorBoundary>
          <LanguageProvider>
            <AppProviders>
              <PerformanceScript />
              <MobileOptimizationScript />
              <ListingMediaCacheScript />
              <TelegramAccessGuard>
                <StartParamDeepLink />
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

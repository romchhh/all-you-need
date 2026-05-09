import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PerformanceScript } from "@/components/PerformanceScript";
import { MobileOptimizationScript } from "@/components/MobileOptimizationScript";
import { TelegramAccessGuard } from "@/components/TelegramAccessGuard";
import { RegistrationGate } from "@/components/RegistrationGate";
import { AppProviders } from "@/components/AppProviders";

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
    <html lang="uk" suppressHydrationWarning>
      <head>
        {/* Meta теги для Telegram WebApp */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Telegram WebApp скрипт - без async для гарантованого завантаження */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
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

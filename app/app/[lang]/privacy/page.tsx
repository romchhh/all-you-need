'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { AppHeader } from '@/components/layout/AppHeader';
import { STICKY_BELOW_APP_HEADER_CLASS } from '@/components/layout/FixedLogoHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

const bodyTextClass =
  'text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]';

export default function PrivacyPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { tg } = useTelegram();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const stickyBar = isLight
    ? 'border-gray-200/90 bg-white/90'
    : 'border-white/15 bg-[#0a0a0a]/90';
  const backBtn = isLight
    ? 'bg-gray-100 hover:bg-gray-200 text-gray-900'
    : 'bg-white/10 hover:bg-white/15 text-white';
  const sectionBorder = isLight ? 'border-gray-200/80' : 'border-white/10';

  return (
    <div
      className="min-h-screen overflow-x-hidden pb-20"
      style={{ background: ac.pageBackground }}
    >
      <AppHeader />
      <div className="mx-auto w-full max-w-2xl overflow-x-hidden">
        <div
          className={`sticky ${STICKY_BELOW_APP_HEADER_CLASS} z-10 border-b px-4 py-3 backdrop-blur-md ${stickyBar}`}
        >
          <button
            type="button"
            onClick={() => {
              router.back();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${backBtn}`}
            aria-label={t('common.back') || 'Назад'}
          >
            <ArrowLeft size={20} />
          </button>
        </div>

        <div className="px-4 py-5">
          <h1 className={`mb-2 text-2xl font-bold leading-tight ${ac.pageHeading}`}>
            {t('privacy.title')}
          </h1>
          <p className={`mb-6 text-sm ${ac.mutedText}`}>
            {t('privacy.lastUpdated')}: {new Date().toLocaleDateString()}
          </p>

          <div className={`space-y-6 ${ac.mutedText}`}>
            <p className={bodyTextClass}>{t('privacy.intro')}</p>

            <div className="space-y-5">
              {(
                [
                  'dataCollection',
                  'dataUsage',
                  'dataSharing',
                  'dataSecurity',
                  'userRights',
                  'cookies',
                  'changes',
                  'contact',
                ] as const
              ).map((key) => (
                <section
                  key={key}
                  className={`border-t pt-5 first:border-t-0 first:pt-0 ${sectionBorder}`}
                >
                  <h2 className={`mb-2 text-base font-semibold ${ac.pageHeading}`}>
                    {t(`privacy.${key}.title`)}
                  </h2>
                  <p className={bodyTextClass}>{t(`privacy.${key}.content`)}</p>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

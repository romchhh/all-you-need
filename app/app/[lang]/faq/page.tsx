'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  OVERLAY_BACK_BUTTON_TOP_CLASS,
  overlayHeaderActionClass,
} from '@/components/layout/FixedLogoHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useScrollToTopOnMount } from '@/features/ui/hooks/useScrollToTopOnMount';

export default function FAQPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { tg } = useTelegram();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  useScrollToTopOnMount();

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
    tg?.HapticFeedback.impactOccurred('light');
  };

  const sectionBtn = isLight
    ? 'bg-white/80 border-gray-200/90 hover:bg-gray-50'
    : 'bg-white/[0.06] border-white/15 hover:bg-white/10';
  const answerCard = isLight
    ? 'bg-white border-gray-200/90'
    : 'bg-white/[0.04] border-white/15';

  const faqSections = [
    {
      key: 'general',
      title: t('faq.sections.general'),
      items: [
        { question: t('faq.general.whatIs'), answer: t('faq.general.whatIsAnswer') },
        { question: t('faq.general.howToUse'), answer: t('faq.general.howToUseAnswer') },
        { question: t('faq.general.isFree'), answer: t('faq.general.isFreeAnswer') },
        { question: t('faq.general.languages'), answer: t('faq.general.languagesAnswer') },
      ],
    },
    {
      key: 'sellers',
      title: t('faq.sections.sellers'),
      items: [
        { question: t('faq.sellers.howToCreate'), answer: t('faq.sellers.howToCreateAnswer') },
        { question: t('faq.sellers.howManyPhotos'), answer: t('faq.sellers.howManyPhotosAnswer') },
        { question: t('faq.sellers.howToEdit'), answer: t('faq.sellers.howToEditAnswer') },
        { question: t('faq.sellers.howToMarkSold'), answer: t('faq.sellers.howToMarkSoldAnswer') },
        { question: t('faq.sellers.howToDelete'), answer: t('faq.sellers.howToDeleteAnswer') },
      ],
    },
    {
      key: 'buyers',
      title: t('faq.sections.buyers'),
      items: [
        { question: t('faq.buyers.howToSearch'), answer: t('faq.buyers.howToSearchAnswer') },
        { question: t('faq.buyers.howToContact'), answer: t('faq.buyers.howToContactAnswer') },
        { question: t('faq.buyers.howToFavorite'), answer: t('faq.buyers.howToFavoriteAnswer') },
        { question: t('faq.buyers.isSafe'), answer: t('faq.buyers.isSafeAnswer') },
      ],
    },
    {
      key: 'paidServices',
      title: t('faq.sections.paidServices'),
      items: [
        { question: t('faq.paidServices.whatServices'), answer: t('faq.paidServices.whatServicesAnswer') },
        { question: t('faq.paidServices.packagesPrice'), answer: t('faq.paidServices.packagesPriceAnswer') },
        { question: t('faq.paidServices.howToPay'), answer: t('faq.paidServices.howToPayAnswer') },
        { question: t('faq.paidServices.refund'), answer: t('faq.paidServices.refundAnswer') },
      ],
    },
    {
      key: 'rules',
      title: t('faq.sections.rules'),
      items: [
        { question: t('faq.rules.whatForbidden'), answer: t('faq.rules.whatForbiddenAnswer') },
        { question: t('faq.rules.whatHappensIf'), answer: t('faq.rules.whatHappensIfAnswer') },
        { question: t('faq.rules.howToReport'), answer: t('faq.rules.howToReportAnswer') },
        { question: t('faq.rules.delivery'), answer: t('faq.rules.deliveryAnswer') },
      ],
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden pb-20">
      <AppHeader />

      <button
        type="button"
        onClick={() => {
          router.back();
          tg?.HapticFeedback.impactOccurred('light');
        }}
        aria-label={t('common.back') || 'Назад'}
        className={`fixed left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${overlayHeaderActionClass(isLight)}`}
      >
        <ArrowLeft size={20} />
      </button>

      <div className="mx-auto w-full max-w-2xl overflow-x-hidden">
        <div className="px-4 pb-5 pt-14">
          <h1 className={`mb-6 text-2xl font-bold leading-tight ${ac.pageHeading}`}>
            {t('faq.title')}
          </h1>

          {faqSections.map((section) => (
            <div key={section.key} className="mb-4">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 transition-colors ${sectionBtn}`}
              >
                <h2 className={`text-left text-base font-semibold ${ac.pageHeading}`}>
                  {section.title}
                </h2>
                <ChevronDown
                  size={20}
                  className={`shrink-0 transition-transform ${ac.mutedText} ${
                    openSections[section.key] ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openSections[section.key] && section.items.length > 0 && (
                <div className="mt-2 space-y-2">
                  {section.items.map((item, index) => (
                    <div
                      key={index}
                      className={`rounded-xl border p-4 ${answerCard}`}
                    >
                      <h3 className={`mb-2 font-semibold ${ac.pageHeading}`}>{item.question}</h3>
                      <p className={`text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word] ${ac.mutedText}`}>
                        {item.answer}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {openSections[section.key] && section.items.length === 0 && (
                <div className={`mt-2 rounded-xl border p-4 ${answerCard}`}>
                  <p className={`text-sm ${ac.mutedText}`}>{t('faq.comingSoon')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

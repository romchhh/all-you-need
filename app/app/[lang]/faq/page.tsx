'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTelegram } from '@/hooks/useTelegram';

export default function FAQPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const { tg } = useTelegram();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (sectionKey: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
    tg?.HapticFeedback.impactOccurred('light');
  };

  const faqSections = [
    {
      key: 'general',
      title: t('faq.sections.general'),
      items: [
        {
          question: t('faq.general.whatIs'),
          answer: t('faq.general.whatIsAnswer')
        },
        {
          question: t('faq.general.howToUse'),
          answer: t('faq.general.howToUseAnswer')
        },
        {
          question: t('faq.general.isFree'),
          answer: t('faq.general.isFreeAnswer')
        },
        {
          question: t('faq.general.languages'),
          answer: t('faq.general.languagesAnswer')
        }
      ]
    },
    {
      key: 'sellers',
      title: t('faq.sections.sellers'),
      items: [
        {
          question: t('faq.sellers.howToCreate'),
          answer: t('faq.sellers.howToCreateAnswer')
        },
        {
          question: t('faq.sellers.howManyPhotos'),
          answer: t('faq.sellers.howManyPhotosAnswer')
        },
        {
          question: t('faq.sellers.howToEdit'),
          answer: t('faq.sellers.howToEditAnswer')
        },
        {
          question: t('faq.sellers.howToMarkSold'),
          answer: t('faq.sellers.howToMarkSoldAnswer')
        },
        {
          question: t('faq.sellers.howToDelete'),
          answer: t('faq.sellers.howToDeleteAnswer')
        }
      ]
    },
    {
      key: 'buyers',
      title: t('faq.sections.buyers'),
      items: [
        {
          question: t('faq.buyers.howToSearch'),
          answer: t('faq.buyers.howToSearchAnswer')
        },
        {
          question: t('faq.buyers.howToContact'),
          answer: t('faq.buyers.howToContactAnswer')
        },
        {
          question: t('faq.buyers.howToFavorite'),
          answer: t('faq.buyers.howToFavoriteAnswer')
        },
        {
          question: t('faq.buyers.isSafe'),
          answer: t('faq.buyers.isSafeAnswer')
        }
      ]
    },
    {
      key: 'paidServices',
      title: t('faq.sections.paidServices'),
      items: [
        {
          question: t('faq.paidServices.whatServices'),
          answer: t('faq.paidServices.whatServicesAnswer')
        },
        {
          question: t('faq.paidServices.packagesPrice'),
          answer: t('faq.paidServices.packagesPriceAnswer')
        },
        {
          question: t('faq.paidServices.howToPay'),
          answer: t('faq.paidServices.howToPayAnswer')
        },
        {
          question: t('faq.paidServices.refund'),
          answer: t('faq.paidServices.refundAnswer')
        }
      ]
    },
    {
      key: 'rules',
      title: t('faq.sections.rules'),
      items: [
        {
          question: t('faq.rules.whatForbidden'),
          answer: t('faq.rules.whatForbiddenAnswer')
        },
        {
          question: t('faq.rules.whatHappensIf'),
          answer: t('faq.rules.whatHappensIfAnswer')
        },
        {
          question: t('faq.rules.howToReport'),
          answer: t('faq.rules.howToReportAnswer')
        },
        {
          question: t('faq.rules.delivery'),
          answer: t('faq.rules.deliveryAnswer')
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center gap-3 z-10">
          <button
            onClick={() => {
              router.back();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{t('faq.title')}</h1>
        </div>

        {/* Content */}
        <div className="p-4">
          {faqSections.map((section) => (
            <div key={section.key} className="mb-4">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                <ChevronDown
                  size={20}
                  className={`text-gray-600 transition-transform ${
                    openSections[section.key] ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openSections[section.key] && section.items.length > 0 && (
                <div className="mt-2 space-y-2">
                  {section.items.map((item, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-xl p-4"
                    >
                      <h3 className="font-semibold text-gray-900 mb-2">{item.question}</h3>
                      <p className="text-gray-700 text-sm leading-relaxed">{item.answer}</p>
                    </div>
                  ))}
                </div>
              )}

              {openSections[section.key] && section.items.length === 0 && (
                <div className="mt-2 p-4 bg-white border border-gray-200 rounded-xl">
                  <p className="text-gray-500 text-sm">{t('faq.comingSoon')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


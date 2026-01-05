'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

export default function PrivacyPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const { tg } = useTelegram();

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
          <h1 className="text-xl font-bold text-gray-900">{t('privacy.title')}</h1>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-500 text-sm mb-6">
              {t('privacy.lastUpdated')}: {new Date().toLocaleDateString()}
            </p>
            
            <div className="space-y-6 text-gray-700">
              <p className="leading-relaxed">
                {t('privacy.intro')}
              </p>
              
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.dataCollection.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.dataCollection.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.dataUsage.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.dataUsage.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.dataSharing.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.dataSharing.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.dataSecurity.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.dataSecurity.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.userRights.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.userRights.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.cookies.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.cookies.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.changes.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.changes.content')}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('privacy.contact.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('privacy.contact.content')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


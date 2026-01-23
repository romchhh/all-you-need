'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

export default function OfertaPage() {
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
          <h1 className="text-xl font-bold text-gray-900">{t('oferta.title')}</h1>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-500 text-sm mb-6">
              {t('oferta.lastUpdated')}: {new Date().toLocaleDateString()}
            </p>
            
            <div className="space-y-6 text-gray-700">
              <p className="leading-relaxed">
                {t('oferta.intro')}
              </p>
              
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.registration.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.registration.item1')}</li>
                    <li>{t('oferta.registration.item2')}</li>
                    <li>{t('oferta.registration.item3')}</li>
                    <li>{t('oferta.registration.item4')}</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.listings.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.listings.item1')}</li>
                    <li>{t('oferta.listings.item2')}</li>
                    <li>{t('oferta.listings.item3')}</li>
                    <li>{t('oferta.listings.item4')}</li>
                    <li>{t('oferta.listings.item5')}</li>
                    <li>{t('oferta.listings.item6')}</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.payment.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.payment.item1')}</li>
                    <li>{t('oferta.payment.item2')}</li>
                    <li>{t('oferta.payment.item3')}</li>
                    <li>{t('oferta.payment.item4')}</li>
                    <li>{t('oferta.payment.item5')}</li>
                  </ul>
                  
                  {/* Інформація про поповнення за реквізитами */}
                  <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-3">{t('oferta.payment.requisites.title') || 'Поповнення за реквізитами'}</h3>
                    <div className="space-y-2 text-sm">
                      <p><strong>{t('oferta.payment.requisites.receiver') || 'Отримувач:'}</strong> {t('business.companyName') || 'ФОП Свіріденко Іван Олександрович'}</p>
                      <p><strong>{t('oferta.payment.requisites.edrpou') || 'ІПН/ЄДРПОУ:'}</strong> {t('business.edrpou') || '3606401739'}</p>
                      <p className="mt-3"><strong>{t('oferta.payment.requisites.uah') || 'Гривня (Україна):'}</strong></p>
                      <p className="pl-4"><strong>IBAN:</strong> {t('business.ibanUAH') || 'UA843220010000026003370043487'}</p>
                      <p className="pl-4"><strong>{t('oferta.payment.requisites.bank') || 'Банк:'}</strong> {t('business.bank') || 'Акціонерне товариство УНІВЕРСАЛ БАНК'}</p>
                      <p className="pl-4"><strong>МФО:</strong> {t('business.mfo') || '322001'}</p>
                      <p className="pl-4"><strong>{t('oferta.payment.requisites.bankEdrpou') || 'ЄДРПОУ Банку:'}</strong> {t('business.bankEdrpou') || '21133352'}</p>
                      <p className="mt-3"><strong>{t('oferta.payment.requisites.eur') || 'Євро (У межах Європи):'}</strong></p>
                      <p className="pl-4"><strong>IBAN:</strong> {t('business.ibanEUR') || 'UA513220010000026005370036447'}</p>
                      <p className="pl-4"><strong>SWIFT/BIC Code:</strong> {t('business.swift') || 'UNJSUAUKXXX'}</p>
                      <p className="pl-4"><strong>{t('oferta.payment.requisites.receiver') || 'Receiver:'}</strong> {t('business.receiver') || 'PE SVIRIDENKO IVAN'}</p>
                      <p className="pl-4"><strong>{t('oferta.payment.requisites.address') || 'Address:'}</strong> {t('business.address') || '94, fl. 3, 04078, Ukraine, c. Kyiv, st. Zamkovetska'}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.privacy.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.privacy.item1')}</li>
                    <li>{t('oferta.privacy.item2')}</li>
                    <li>{t('oferta.privacy.item3')}</li>
                    <li>{t('oferta.privacy.item4')}</li>
                    <li>{t('oferta.privacy.item5')}</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.behavior.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.behavior.item1')}</li>
                    <li>{t('oferta.behavior.item2')}</li>
                    <li>{t('oferta.behavior.item3')}</li>
                    <li>{t('oferta.behavior.item4')}</li>
                    <li>{t('oferta.behavior.item5')}</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.responsibility.title')}
                  </h2>
                  <ul className="list-disc pl-6 space-y-2 text-sm leading-relaxed">
                    <li>{t('oferta.responsibility.item2')}</li>
                    <li>{t('oferta.responsibility.item3')}</li>
                    <li>{t('oferta.responsibility.item4')}</li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('oferta.contact.title')}
                  </h2>
                  <p className="text-sm leading-relaxed">
                    {t('oferta.contact.content')}
                  </p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="font-semibold text-blue-900 mb-2">{t('oferta.important.title')}</p>
                <p className="text-blue-800 text-sm">
                  {t('oferta.important.content')}
                </p>
              </div>

              <div className="mt-8 text-sm text-gray-500">
                <p>{t('oferta.version')}: 1.0</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

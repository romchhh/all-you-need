'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowLeft, ExternalLink, ShoppingBag, FileText, Info, Building2, Globe } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';

export default function BusinessPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useLanguage();
  const { tg } = useTelegram();
  const lang = (params?.lang as string) || 'uk';

  // Реквізити ФОП - потрібно заповнити реальними даними
  const businessInfo = {
    companyName: t('business.companyName') || 'ФОП "Trade Ground"',
    edrpou: t('business.edrpou') || '12345678',
    iban: t('business.iban') || 'UA123456789012345678901234567',
    bank: t('business.bank') || 'ПАТ "ПриватБанк"',
    address: t('business.address') || 'м. Київ, вул. Прикладная, 123',
    phone: t('business.phone') || '+380 (XX) XXX-XX-XX',
    email: t('business.email') || 'info@tradeground.com',
    catalogUrl: `/${lang}/bazaar`,
    instagram: t('business.instagram') || 'https://www.instagram.com/tradeground'
  };

  const services = [
    {
      title: t('business.services.marketplace.title') || 'Маркетплейс',
      description: t('business.services.marketplace.description') || 'Платформа для продажу та покупки товарів через Telegram',
      icon: ShoppingBag
    },
    {
      title: t('business.services.catalog.title') || 'Каталог товарів',
      description: t('business.services.catalog.description') || 'Онлайн-каталог з категоріями, пошуком та фільтрами',
      icon: FileText
    },
    {
      title: t('business.services.platform.title') || 'Мобільна платформа',
      description: t('business.services.platform.description') || 'Telegram Mini App для зручного користування на мобільних пристроях',
      icon: Globe
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#3F5331] via-[#2A2A2A] to-[#000000] pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#000000]/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3 z-10">
          <button
            onClick={() => {
              router.back();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">{t('business.title') || 'Про бізнес'}</h1>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Опис послуг */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-3 mb-4">
              <Info size={24} className="text-[#D3F1A7]" />
              <h2 className="text-xl font-bold text-white">
                {t('business.about.title') || 'Про наші послуги'}
              </h2>
            </div>
            <p className="text-white/90 leading-relaxed mb-6">
              {t('business.about.description') || 'Trade Ground Marketplace - це сучасна платформа для продажу та покупки товарів через Telegram. Ми надаємо зручний інтерфейс для створення оголошень, пошуку товарів та зв\'язку між покупцями та продавцями.'}
            </p>

            <div className="space-y-4 mt-6">
              {services.map((service, index) => {
                const Icon = service.icon;
                return (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-[#D3F1A7]/20 flex items-center justify-center flex-shrink-0">
                      <Icon size={20} className="text-[#D3F1A7]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{service.title}</h3>
                      <p className="text-white/70 text-sm leading-relaxed">{service.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Посилання на каталог */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingBag size={24} className="text-[#D3F1A7]" />
              <h2 className="text-xl font-bold text-white">
                {t('business.catalog.title') || 'Каталог товарів'}
              </h2>
            </div>
            <p className="text-white/90 leading-relaxed mb-4">
              {t('business.catalog.description') || 'Переглянути всі доступні товари та оголошення на нашій платформі'}
            </p>
            <button
              onClick={() => {
                router.push(businessInfo.catalogUrl);
                tg?.HapticFeedback.impactOccurred('medium');
              }}
              className="w-full bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 text-black font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingBag size={20} />
              <span>{t('business.catalog.button') || 'Відкрити каталог'}</span>
              <ExternalLink size={18} />
            </button>
          </div>

          {/* Реквізити ФОП */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-3 mb-4">
              <Building2 size={24} className="text-[#D3F1A7]" />
              <h2 className="text-xl font-bold text-white">
                {t('business.details.title') || 'Реквізити'}
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <span className="text-white/70 text-sm">{t('business.details.companyName') || 'Назва:'}</span>
                <p className="text-white font-medium mt-1">{businessInfo.companyName}</p>
              </div>

              <div>
                <span className="text-white/70 text-sm">{t('business.details.edrpou') || 'ЄДРПОУ:'}</span>
                <p className="text-white font-medium mt-1">{businessInfo.edrpou}</p>
              </div>

              <div>
                <span className="text-white/70 text-sm">{t('business.details.iban') || 'IBAN:'}</span>
                <p className="text-white font-medium mt-1 break-all">{businessInfo.iban}</p>
              </div>

              <div>
                <span className="text-white/70 text-sm">{t('business.details.bank') || 'Банк:'}</span>
                <p className="text-white font-medium mt-1">{businessInfo.bank}</p>
              </div>

              <div>
                <span className="text-white/70 text-sm">{t('business.details.address') || 'Адреса:'}</span>
                <p className="text-white font-medium mt-1">{businessInfo.address}</p>
              </div>

              {businessInfo.phone && (
                <div>
                  <span className="text-white/70 text-sm">{t('business.details.phone') || 'Телефон:'}</span>
                  <p className="text-white font-medium mt-1">{businessInfo.phone}</p>
                </div>
              )}

              {businessInfo.email && (
                <div>
                  <span className="text-white/70 text-sm">{t('business.details.email') || 'Email:'}</span>
                  <a 
                    href={`mailto:${businessInfo.email}`}
                    className="text-[#D3F1A7] font-medium mt-1 hover:underline block"
                  >
                    {businessInfo.email}
                  </a>
                </div>
              )}

              {businessInfo.instagram && (
                <div>
                  <span className="text-white/70 text-sm">{t('business.details.instagram') || 'Instagram:'}</span>
                  <a 
                    href={businessInfo.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D3F1A7] font-medium mt-1 hover:underline flex items-center gap-2"
                  >
                    {businessInfo.instagram}
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Додаткова інформація */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">
              {t('business.additional.title') || 'Додаткова інформація'}
            </h2>
            <p className="text-white/90 leading-relaxed text-sm">
              {t('business.additional.content') || 'Якщо у вас виникли питання або потрібна додаткова інформація, будь ласка, зв\'яжіться з нами через контактні дані, вказані вище.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTelegram } from '@/hooks/useTelegram';

interface Promotion {
  type: string;
  price: number;
  duration: number;
  badge?: string;
}

interface PromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPromotion: (promotionType: string | null, paymentMethod?: 'balance' | 'direct') => void;
  listingId?: number | null;
  telegramId?: string;
  // Опціональні пропси для сумісності (не використовуються, але дозволяють передавати)
  currentPromotion?: string | null;
  promotionEnds?: string | null;
  showSkipButton?: boolean;
}

const PROMOTIONS: Promotion[] = [
  { type: 'highlighted', price: 1.5, duration: 7 },
  { type: 'top_category', price: 2.0, duration: 7, badge: 'recommended' },
  { type: 'vip', price: 4.5, duration: 7 },
];

export default function PromotionModal({
  isOpen,
  onClose,
  onSelectPromotion,
  listingId,
  telegramId,
  currentPromotion, // Ігноруємо для сумісності
  promotionEnds, // Ігноруємо для сумісності
  showSkipButton = true, // Використовуємо для показу кнопки "Пропустити"
}: PromotionModalProps) {
  const { t } = useLanguage();
  const { user } = useTelegram();
  const [selectedPromotion, setSelectedPromotion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Блокуємо скрол при відкритті модального вікна
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSelectPromotion = async () => {
    if (!selectedPromotion) return;

    setLoading(true);
    // Не передаємо paymentMethod - він буде вибраний в PaymentSummaryModal
    onSelectPromotion(selectedPromotion);
  };

  const handleSkip = () => {
    onSelectPromotion(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 pb-24 overflow-hidden" style={{ position: 'fixed', paddingBottom: '100px' }}>
      <div className="bg-[#000000] rounded-2xl border-2 border-white max-w-md w-full max-h-[calc(100vh-80px)] overflow-hidden flex flex-col relative z-[100000]">
        {/* Header */}
        <div className="flex-shrink-0 bg-[#000000] border-b border-white/20 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {t('promotions.title')}
            </h2>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-white/70 mt-2">
            {t('promotions.description')}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4">
          {/* Типи реклами */}
          {PROMOTIONS.map((promo) => (
            <button
              key={promo.type}
              onClick={() => setSelectedPromotion(promo.type)}
              className={`w-full text-left rounded-xl p-5 border-2 transition-all ${
                selectedPromotion === promo.type
                  ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 shadow-lg scale-[1.02]'
                  : 'border-white/20 bg-[#1C1C1C] hover:border-white/40 hover:bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      promo.type === 'highlighted' 
                        ? 'bg-[#1C1C1C] border border-white/20' 
                        : promo.type === 'top_category'
                        ? 'bg-[#1C1C1C] border border-white/20'
                        : 'bg-[#1C1C1C] border border-white/20'
                    }`}>
                      {promo.type === 'highlighted' && (
                        <svg className="w-6 h-6 text-[#D3F1A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                      )}
                      {promo.type === 'top_category' && (
                        <svg className="w-6 h-6 text-[#D3F1A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      )}
                      {promo.type === 'vip' && (
                        <svg className="w-6 h-6 text-[#D3F1A7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">
                        {t(`promotions.${promo.type}`)}
                      </h3>
                      {promo.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#D3F1A7]/20 text-[#D3F1A7] border border-[#D3F1A7]/30">
                          {t(`promotions.${promo.badge}`)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-white/70 mb-3">
                    {t(`promotions.${promo.type}Desc`)}
                  </p>
                  
                  <div className="bg-[#000000] rounded-lg p-3 mb-3 border border-white/20">
                    <p className="text-xs text-white/70 whitespace-pre-line leading-relaxed">
                      {t(`promotions.${promo.type}Features`)}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-[#D3F1A7]">
                        {promo.price.toFixed(1)}€
                      </p>
                      <p className="text-xs text-white/70">
                        {t('promotions.duration')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                  selectedPromotion === promo.type
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                    : 'border-white/30'
                }`}>
                  {selectedPromotion === promo.type && (
                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-[#000000] border-t border-white/20 px-6 py-4 rounded-b-2xl space-y-2">
          <button
            onClick={handleSelectPromotion}
            disabled={!selectedPromotion || loading}
            className={`w-full py-4 rounded-xl font-semibold text-black transition-all ${
              !selectedPromotion || loading
                ? 'bg-white/20 cursor-not-allowed text-white/50'
                : 'bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 shadow-lg hover:shadow-xl'
            }`}
          >
            {loading ? t('common.loading') : t('common.continue')}
          </button>
          
          {showSkipButton && (
            <button
              onClick={handleSkip}
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white bg-transparent border border-white/20 hover:bg-white/10 transition-all"
            >
              {t('promotions.noPromotion')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  onSelectPromotion: (promotionType: string | null) => void;
  listingId?: number | null;
  telegramId?: string;
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
    onSelectPromotion(selectedPromotion);
  };

  const handleSkip = () => {
    onSelectPromotion(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative z-[10000]">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {t('promotions.title')}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {t('promotions.description')}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Типи реклами */}
          {PROMOTIONS.map((promo) => (
            <button
              key={promo.type}
              onClick={() => setSelectedPromotion(promo.type)}
              className={`w-full text-left rounded-xl p-5 border-2 transition-all ${
                selectedPromotion === promo.type
                  ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg scale-[1.02]'
                  : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      promo.type === 'highlighted' 
                        ? 'bg-yellow-100' 
                        : promo.type === 'top_category'
                        ? 'bg-orange-100'
                        : 'bg-purple-100'
                    }`}>
                      {promo.type === 'highlighted' && (
                        <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                      )}
                      {promo.type === 'top_category' && (
                        <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      )}
                      {promo.type === 'vip' && (
                        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">
                        {t(`promotions.${promo.type}`)}
                      </h3>
                      {promo.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                          {t(`promotions.${promo.badge}`)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">
                    {t(`promotions.${promo.type}Desc`)}
                  </p>
                  
                  <div className="bg-white rounded-lg p-3 mb-3 border border-gray-100">
                    <p className="text-xs text-gray-600 whitespace-pre-line leading-relaxed">
                      {t(`promotions.${promo.type}Features`)}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {promo.price.toFixed(1)}€
                      </p>
                      <p className="text-xs text-gray-500">
                        {t('promotions.duration')}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                  selectedPromotion === promo.type
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300'
                }`}>
                  {selectedPromotion === promo.type && (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl space-y-2">
          <button
            onClick={handleSelectPromotion}
            disabled={!selectedPromotion || loading}
            className={`w-full py-4 rounded-xl font-semibold text-white transition-all ${
              !selectedPromotion || loading
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {loading ? t('common.loading') : t('common.continue')}
          </button>
          
          <button
            onClick={handleSkip}
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
          >
            {t('promotions.noPromotion')}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  { type: 'top_category', price: 2.0, duration: 7 },
  { type: 'vip', price: 4.5, duration: 7, badge: 'recommended' },
];

export default function PromotionModal({
  isOpen,
  onClose,
  onSelectPromotion,
  listingId,
  telegramId,
  currentPromotion,
  promotionEnds,
  showSkipButton = true,
}: PromotionModalProps) {
  const { t } = useLanguage();
  const { user } = useTelegram();
  const [selectedPromotion, setSelectedPromotion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePromotions, setActivePromotions] = useState<string[]>([]);
  const [activePromotionEnds, setActivePromotionEnds] = useState<string | null>(null);

  // Завантажуємо активні реклами для оголошення
  useEffect(() => {
    if (isOpen && listingId) {
      fetch(`/api/listings/promotions?listingId=${listingId}`)
        .then(res => res.json())
        .then(data => {
          if (data.activePromotions) {
            setActivePromotions(data.activePromotions);
            setActivePromotionEnds(data.promotionEnds);
          }
        })
        .catch(err => {
          console.error('Error fetching active promotions:', err);
          // Fallback на старий спосіб
          if (currentPromotion) {
            setActivePromotions([currentPromotion]);
            if (promotionEnds) {
              setActivePromotionEnds(promotionEnds);
            }
          }
        });
    } else {
      setActivePromotions([]);
      setActivePromotionEnds(null);
    }
  }, [isOpen, listingId, currentPromotion, promotionEnds]);

  // Перевіряємо чи активна реклама (для сумісності зі старим кодом)
  const isPromotionActive = currentPromotion && promotionEnds 
    ? new Date(promotionEnds) > new Date() 
    : false;
  
  // Перевіряємо чи конкретний тип реклами активний
  const isPromotionTypeActive = (promoType: string): boolean => {
    return activePromotions.includes(promoType) || 
           (currentPromotion === promoType && isPromotionActive);
  };

  // Функція для форматування залишкового часу
  const getTimeRemaining = (endsAt: string): string => {
    const now = new Date();
    const ends = new Date(endsAt);
    const diff = ends.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      if (days === 1) {
        return `1 ${t('profile.day') || 'день'}`;
      } else if (days <= 4) {
        return `${days} ${t('profile.days') || 'дні'}`;
      } else {
        return `${days} ${t('profile.days') || 'днів'}`;
      }
    } else if (hours > 0) {
      return `${hours} ${hours === 1 ? t('common.hour') : t('common.hours')}`;
    }
    return t('common.soon');
  };

  // Блокуємо скрол при відкритті модального вікна
  useEffect(() => {
    if (isOpen) {
      // Зберігаємо поточну позицію скролу
      const scrollY = window.scrollY;
      // Блокуємо скрол на body та html
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Відновлюємо скрол
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      // Відновлюємо позицію скролу
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    
    return () => {
      // Очищення при розмонтуванні
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
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
    <div 
      className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 pb-24 overflow-hidden" 
      style={{ 
        position: 'fixed', 
        paddingBottom: '100px',
        touchAction: 'none',
        overscrollBehavior: 'none'
      }}
      onTouchMove={(e) => {
        // Блокуємо скрол при дотику до модального вікна
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
    >
      <div 
        className="bg-[#000000] rounded-2xl border-2 border-white max-w-md w-full max-h-[calc(100vh-80px)] overflow-hidden flex flex-col relative z-[100000]"
        onTouchMove={(e) => {
          // Дозволяємо скрол тільки всередині контенту модального вікна
          const target = e.currentTarget;
          const content = target.querySelector('[data-scrollable]') as HTMLElement;
          if (content && content.contains(e.target as Node)) {
            // Дозволяємо скрол всередині контенту
            return;
          }
          // Блокуємо скрол поза контентом
          e.stopPropagation();
        }}
      >
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
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4" data-scrollable>
          {/* Інформація про активну рекламу */}
          {activePromotions.length > 0 && (
            <div className="mb-4 p-4 rounded-xl bg-[#D3F1A7]/10 border-2 border-[#D3F1A7]">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-[#D3F1A7] font-semibold">{t('sales.promotion')}:</span>
                {activePromotions.map((promoType) => (
                  <div key={promoType} className="px-2.5 py-1 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap">
                    {promoType === 'vip' ? 'VIP' : promoType === 'top_category' ? 'TOP' : t('promotions.highlighted')}
                  </div>
                ))}
              </div>
              {activePromotionEnds && (
                <p className="text-sm text-white/70">
                  {t('common.activeUntil') || 'Активна до'}: {getTimeRemaining(activePromotionEnds)}
                </p>
              )}
            </div>
          )}

          {/* Типи реклами */}
          {PROMOTIONS.map((promo) => {
            const isCurrentPromotion = isPromotionTypeActive(promo.type);
            // Для highlighted та top_category - якщо обидві вже активні, то обидві кнопки неактивні
            // Для інших типів - якщо вже активний, то неактивний
            const hasBothHighlightedAndTop = isPromotionTypeActive('highlighted') && isPromotionTypeActive('top_category');
            const isDisabled = isCurrentPromotion || 
              (promo.type === 'highlighted' && hasBothHighlightedAndTop) ||
              (promo.type === 'top_category' && hasBothHighlightedAndTop);
            
            return (
            <button
              key={promo.type}
              onClick={() => !isDisabled && setSelectedPromotion(promo.type)}
              disabled={isDisabled}
              className={`w-full text-left rounded-xl p-5 border-2 transition-all ${
                isDisabled
                  ? 'border-white/10 bg-[#1C1C1C]/50 opacity-50 cursor-not-allowed'
                  : selectedPromotion === promo.type
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
                      {isDisabled ? (
                        <>
                          <p className="text-sm font-semibold text-[#D3F1A7]">
                            {t('common.active') || 'Активна'}
                          </p>
                          <p className="text-xs text-white/70">
                            {hasBothHighlightedAndTop && (promo.type === 'highlighted' || promo.type === 'top_category')
                              ? t('promotions.bothActive') || 'Обидві реклами вже активні'
                              : t('common.cannotBuySame') || 'Не можна купити поки активна'}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-[#D3F1A7]">
                            {promo.price.toFixed(1)}€
                          </p>
                          <p className="text-xs text-white/70">
                            {t('promotions.duration')}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {!isDisabled && (
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
                )}
              </div>
            </button>
          );
          })}
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
              className="w-full py-3 rounded-xl font-semibold text-white bg-transparent border border-white/20 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <span>{t('promotions.noPromotion')}</span>
              <span 
                className="px-2 py-0.5 bg-[#D3F1A7] text-black text-xs font-bold rounded whitespace-nowrap inline-block"
                style={{ transform: 'rotate(-8deg)' }}
              >
                {t('common.free') || 'Free'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

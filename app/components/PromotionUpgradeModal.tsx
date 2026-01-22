'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTelegram } from '@/hooks/useTelegram';
import { PROMOTION_PRICES, PromotionType } from '@/utils/paymentConstants';

interface PromotionUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPromotion: (promotionType: string | null, paymentMethod?: 'balance' | 'direct') => void;
  listingId: number;
  currentPromotion?: string | null;
  promotionEnds?: string | null;
  telegramId?: string;
  // Чи показувати кнопку «Опублікувати без реклами»
  showSkipButton?: boolean;
}

export default function PromotionUpgradeModal({
  isOpen,
  onClose,
  onSelectPromotion,
  listingId,
  currentPromotion,
  promotionEnds,
  telegramId,
  showSkipButton = true,
}: PromotionUpgradeModalProps) {
  const { t } = useLanguage();
  const { user } = useTelegram();
  const [selectedPromotion, setSelectedPromotion] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Використовуємо telegramId з пропсів або з user
  const userId = telegramId || user?.id;

  const fetchBalance = async () => {
    if (!userId) {
      console.log('No userId available for fetching balance');
      return;
    }
    
    try {
      console.log('Fetching balance for userId:', userId);
      const response = await fetch(`/api/user/balance?telegramId=${userId}`);
      
      if (!response.ok) {
        console.error('Failed to fetch balance:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      console.log('Balance data received:', data);
      
      if (data && typeof data.balance === 'number') {
        setBalance(data.balance);
        console.log('Balance set to:', data.balance);
      } else {
        console.warn('Invalid balance data:', data);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  useEffect(() => {
    console.log('PromotionUpgradeModal effect triggered:', { isOpen, userId });
    if (isOpen && userId) {
      console.log('Modal opened, fetching balance for:', userId);
      fetchBalance();
    } else if (isOpen && !userId) {
      console.warn('Modal opened but no userId available');
    }

    // Блокуємо скролл body коли модальне вікно відкрите
    if (isOpen) {
      // Зберігаємо поточну позицію скролу
      const scrollY = window.scrollY;
      // Блокуємо скрол на body та html
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';

      return () => {
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
      };
    }
  }, [isOpen, userId]);

  // Визначаємо ціну з урахуванням поточної реклами
  const getUpgradePrice = (targetType: string): number => {
    const targetPromo = PROMOTION_PRICES[targetType as PromotionType];
    if (!targetPromo) return 0;

    if (!currentPromotion) {
      return targetPromo.price;
    }

    const currentPromo = PROMOTION_PRICES[currentPromotion as PromotionType];
    if (!currentPromo) {
      return targetPromo.price;
    }

    // Різниця в ціні
    return Math.max(0, targetPromo.price - currentPromo.price);
  };

  const handleSelectPromotion = async () => {
    if (!selectedPromotion) return;
    
    const upgradePrice = getUpgradePrice(selectedPromotion);

    // Перевіряємо баланс якщо оплата з балансу
    if (paymentMethod === 'balance' && balance < upgradePrice) {
      alert(t('payments.insufficientBalance'));
      return;
    }

    setLoading(true);
    onSelectPromotion(selectedPromotion, paymentMethod);
  };

  const handleSkip = () => {
    onSelectPromotion(null);
  };

  if (!isOpen) return null;

  const promotionLevels = [
    { type: 'highlighted', level: 1 },
    { type: 'top_category', level: 2 },
    { type: 'vip', level: 3 },
  ];

  const currentLevel = currentPromotion 
    ? promotionLevels.find(p => p.type === currentPromotion)?.level || 0
    : 0;

  // Фільтруємо тільки ті рекламні пакети, що вищі за поточний
  const availableUpgrades = promotionLevels.filter(p => p.level > currentLevel);

  // Обчислюємо кількість днів, що залишилися для VIP реклами
  const getDaysLeftForVIP = (): number | null => {
    if (currentPromotion === 'vip' && promotionEnds) {
      const endsAt = new Date(promotionEnds);
      const now = new Date();
      if (endsAt > now) {
        const diffTime = endsAt.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
      }
    }
    return null;
  };

  const daysLeft = getDaysLeftForVIP();

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
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onWheel={(e) => {
        // Блокуємо скролл фонового контенту
        e.stopPropagation();
      }}
    >
      <div className="bg-[#000000] rounded-2xl border-2 border-white max-w-md w-full overflow-y-auto flex flex-col relative z-[100000]" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {/* Header */}
        <div className="flex-shrink-0 bg-[#000000] border-b border-white/20 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {currentPromotion ? t('promotions.upgradeTitle') : t('promotions.title')}
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
          
          {currentPromotion && (
            <div className="mt-3 bg-[#1C1C1C] rounded-lg p-3 border border-white/20">
              <p className="text-sm text-white">
                <span className="font-semibold">{t('promotions.current')}:</span> {t(`promotions.${currentPromotion}`)}
              </p>
              {currentPromotion === 'vip' && daysLeft !== null && daysLeft > 0 && (
                <p className="text-sm text-[#D3F1A7] mt-2 font-medium">
                  {daysLeft === 1 
                    ? t('promotions.vipActiveOneDay', { days: String(daysLeft) })
                    : t('promotions.vipActiveDays', { days: String(daysLeft) })}
                </p>
              )}
              {currentPromotion !== 'vip' && (
                <p className="text-xs text-white/70 mt-1">
                  {t('promotions.upgradeDescription')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-4"
          data-scrollable
          onWheel={(e) => {
            // Дозволяємо скролл тільки всередині контенту
            e.stopPropagation();
          }}
        >
          {/* Показуємо баланс */}
          <div className="bg-[#1C1C1C] rounded-xl p-4 border border-white/20">
            <div className="flex justify-between items-center">
              <p className="text-sm text-white/70">{t('payments.currentBalance')}</p>
              <p className="text-2xl font-bold text-[#D3F1A7]">{balance.toFixed(2)}€</p>
            </div>
          </div>

          {availableUpgrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-lg font-semibold text-white mb-2">
                {t('promotions.maxLevel')}
              </p>
              <p className="text-sm text-white/70">
                {t('promotions.maxLevelDesc')}
              </p>
            </div>
          ) : (
            <>
              {availableUpgrades.map(({ type }) => {
                const upgradePrice = getUpgradePrice(type);
                const fullPrice = PROMOTION_PRICES[type as PromotionType]?.price || 0;
                const isDiscount = upgradePrice < fullPrice;

                return (
                  <button
                    key={type}
                    onClick={() => setSelectedPromotion(type)}
                    className={`w-full text-left rounded-xl p-5 border-2 transition-all ${
                      selectedPromotion === type
                        ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 shadow-lg scale-[1.02]'
                        : 'border-white/20 hover:border-white/40 hover:shadow-md bg-[#1C1C1C]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2">
                          <h3 className={`font-bold text-lg ${
                            selectedPromotion === type ? 'text-[#D3F1A7]' : 'text-white'
                          }`}>
                            {t(`promotions.${type}`)}
                          </h3>
                        </div>
                        
                        <p className={`text-sm mb-3 ${
                          selectedPromotion === type ? 'text-white/90' : 'text-white/70'
                        }`}>
                          {t(`promotions.${type}Desc`)}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <p className={`text-2xl font-bold ${
                                selectedPromotion === type ? 'text-[#D3F1A7]' : 'text-white'
                              }`}>
                                {upgradePrice.toFixed(1)}€
                              </p>
                              {isDiscount && (
                                <p className="text-sm text-white/50 line-through">
                                  {fullPrice.toFixed(1)}€
                                </p>
                              )}
                            </div>
                            {isDiscount && (
                              <p className="text-xs text-[#D3F1A7] font-medium">
                                {t('promotions.upgradeDiscount')} {(fullPrice - upgradePrice).toFixed(1)}€
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                        selectedPromotion === type
                          ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                          : 'border-white/30'
                      }`}>
                        {selectedPromotion === type && (
                          <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Вибір способу оплати */}
          {selectedPromotion && availableUpgrades.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-white/20">
              <p className="font-semibold text-white">{t('listingPackages.selectPayment')}</p>
              
              <button
                onClick={() => setPaymentMethod('balance')}
                className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                  paymentMethod === 'balance'
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]/20'
                    : 'border-white/20 hover:border-white/40 bg-[#1C1C1C]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#1C1C1C] rounded-full p-2 border border-white/20">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${
                        paymentMethod === 'balance' ? 'text-[#D3F1A7]' : 'text-white'
                      }`}>{t('payments.payFromBalance')}</p>
                      <p className="text-sm text-white/70">{balance.toFixed(2)}€</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'balance'
                      ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                      : 'border-white/30'
                  }`}>
                    {paymentMethod === 'balance' && (
                      <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>

              <button
                onClick={() => setPaymentMethod('direct')}
                className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                  paymentMethod === 'direct'
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]/20'
                    : 'border-white/20 hover:border-white/40 bg-[#1C1C1C]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#1C1C1C] rounded-full p-2 border border-white/20">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${
                        paymentMethod === 'direct' ? 'text-[#D3F1A7]' : 'text-white'
                      }`}>{t('payments.payDirect')}</p>
                      <p className="text-sm text-white/70">Monobank</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'direct'
                      ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                      : 'border-white/30'
                  }`}>
                    {paymentMethod === 'direct' && (
                      <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {availableUpgrades.length > 0 && (
          <div className="flex-shrink-0 bg-[#000000] border-t border-white/20 px-6 py-4 rounded-b-2xl space-y-2">
            <button
              onClick={handleSelectPromotion}
              disabled={!selectedPromotion || loading}
              className={`w-full py-4 rounded-xl font-semibold transition-all ${
                !selectedPromotion || loading
                  ? 'bg-white/20 text-white/50 cursor-not-allowed border border-white/20'
                  : 'bg-[#D3F1A7] text-black hover:bg-[#D3F1A7]/90 shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? t('common.loading') : currentPromotion ? t('promotions.upgradeNow') : t('promotions.addPromotion')}
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
        )}
      </div>
    </div>
  );
}

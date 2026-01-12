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
  telegramId?: string;
}

export default function PromotionUpgradeModal({
  isOpen,
  onClose,
  onSelectPromotion,
  listingId,
  currentPromotion,
  telegramId,
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

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative z-[10000]">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {currentPromotion ? t('promotions.upgradeTitle') : t('promotions.title')}
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
          
          {currentPromotion && (
            <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-200">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">{t('promotions.current')}:</span> {t(`promotions.${currentPromotion}`)}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {t('promotions.upgradeDescription')}
              </p>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Показуємо баланс */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">{t('payments.currentBalance')}</p>
              <p className="text-2xl font-bold text-gray-900">{balance.toFixed(2)}€</p>
            </div>
          </div>

          {availableUpgrades.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">👑</div>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                {t('promotions.maxLevel')}
              </p>
              <p className="text-sm text-gray-600">
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
                        ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg scale-[1.02]'
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            type === 'highlighted' 
                              ? 'bg-yellow-100' 
                              : type === 'top_category'
                              ? 'bg-orange-100'
                              : 'bg-purple-100'
                          }`}>
                            {type === 'highlighted' && <span className="text-2xl">⭐</span>}
                            {type === 'top_category' && <span className="text-2xl">🔥</span>}
                            {type === 'vip' && <span className="text-2xl">👑</span>}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-gray-900">
                              {t(`promotions.${type}`)}
                            </h3>
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3">
                          {t(`promotions.${type}Desc`)}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-2">
                              <p className="text-2xl font-bold text-blue-600">
                                {upgradePrice.toFixed(1)}€
                              </p>
                              {isDiscount && (
                                <p className="text-sm text-gray-400 line-through">
                                  {fullPrice.toFixed(1)}€
                                </p>
                              )}
                            </div>
                            {isDiscount && (
                              <p className="text-xs text-green-600 font-medium">
                                {t('promotions.upgradeDiscount')} {(fullPrice - upgradePrice).toFixed(1)}€
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                        selectedPromotion === type
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedPromotion === type && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <p className="font-semibold text-gray-900">{t('listingPackages.selectPayment')}</p>
              
              <button
                onClick={() => setPaymentMethod('balance')}
                className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                  paymentMethod === 'balance'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 rounded-full p-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{t('payments.payFromBalance')}</p>
                      <p className="text-sm text-gray-600">{balance.toFixed(2)}€</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'balance'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {paymentMethod === 'balance' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 rounded-full p-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{t('payments.payDirect')}</p>
                      <p className="text-sm text-gray-600">Monobank</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'direct'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {paymentMethod === 'direct' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {loading ? t('common.loading') : currentPromotion ? t('promotions.upgradeNow') : t('promotions.addPromotion')}
            </button>
            
            {!currentPromotion && (
              <button
                onClick={handleSkip}
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all"
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

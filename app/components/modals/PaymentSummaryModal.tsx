'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useState, useEffect } from 'react';

interface PaymentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: 'balance' | 'direct') => void;
  packageType?: string | null;
  promotionType?: string | null;
  userBalance?: number;
  tg: TelegramWebApp | null;
}

const PACKAGE_PRICES: Record<string, number> = {
  'pack_3': 5.0,
  'pack_5': 8.0,
  'pack_10': 15.0,
  'pack_30': 30.0,
};

const PROMOTION_PRICES: Record<string, number> = {
  'highlighted': 1.5,
  'top_category': 2.0,
  'vip': 4.5,
};

export const PaymentSummaryModal = ({
  isOpen,
  onClose,
  onConfirm,
  packageType,
  promotionType,
  userBalance = 0,
  tg
}: PaymentSummaryModalProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');

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

  if (!isOpen) return null;

  const overlay = isLight ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/50';
  const cardShell = isLight
    ? 'bg-white rounded-2xl border-2 border-gray-200/90 max-w-md w-full max-h-[calc(100vh-80px)] overflow-hidden flex flex-col relative z-[100000] shadow-2xl ring-1 ring-black/[0.05]'
    : 'bg-[#000000] rounded-2xl border-2 border-white max-w-md w-full max-h-[calc(100vh-80px)] overflow-hidden flex flex-col relative z-[100000]';
  const headerBar = isLight
    ? 'flex-shrink-0 bg-white border-b border-gray-200/90 px-6 py-4 rounded-t-2xl'
    : 'flex-shrink-0 bg-[#000000] border-b border-white/20 px-6 py-4 rounded-t-2xl';
  const titleCls = isLight ? 'text-xl font-bold text-gray-900' : 'text-xl font-bold text-white';
  const closeCls = isLight
    ? 'text-gray-500 hover:text-gray-900 transition-colors'
    : 'text-white/70 hover:text-white transition-colors';
  const panel = isLight
    ? 'bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-200/90'
    : 'bg-[#1C1C1C] rounded-2xl p-4 space-y-3 border border-white/20';
  const panelTitle = isLight ? 'font-semibold text-gray-900 mb-3' : 'font-semibold text-white mb-3';
  const rowMuted = isLight ? 'text-gray-600' : 'text-white/70';
  const rowStrong = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const totalLabel = isLight ? 'font-bold text-gray-900 text-lg' : 'font-bold text-white text-lg';
  const accentMoney = isLight ? 'font-bold text-[#3F5331] text-xl' : 'font-bold text-[#C8E6A0] text-xl';
  const balanceAccent = isLight ? 'font-semibold text-[#3F5331] text-lg' : 'font-semibold text-[#C8E6A0] text-lg';
  const divider = isLight ? 'border-t border-gray-200/90 pt-3 mt-3' : 'border-t border-white/20 pt-3 mt-3';
  const sectionHeading = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const methodUnselected = isLight
    ? 'border-gray-200/90 bg-white'
    : 'border-white/20 bg-[#1C1C1C]';
  const methodSelected = 'border-[#3F5331] bg-[#3F5331]/20';
  const radioIdle = isLight ? 'border-gray-300' : 'border-white/30';
  const labelStrong = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const labelSub = isLight ? 'text-sm text-gray-600' : 'text-sm text-white/70';
  const footerBar = isLight
    ? 'flex-shrink-0 bg-white border-t border-gray-200/90 px-6 py-4 rounded-b-2xl space-y-2'
    : 'flex-shrink-0 bg-[#000000] border-t border-white/20 px-6 py-4 rounded-b-2xl space-y-2';
  const primaryDisabled = isLight
    ? 'bg-gray-200 cursor-not-allowed text-gray-500'
    : 'bg-white/20 cursor-not-allowed text-white/50';
  const cancelBtn = isLight
    ? 'w-full py-3 rounded-xl font-semibold text-gray-900 bg-transparent border border-gray-300 hover:bg-gray-100 transition-all'
    : 'w-full py-3 rounded-xl font-semibold text-white bg-transparent border border-white/20 hover:bg-white/10 transition-all';

  const packagePrice = packageType ? PACKAGE_PRICES[packageType] || 0 : 0;
  const promotionPrice = promotionType ? PROMOTION_PRICES[promotionType] || 0 : 0;
  const totalPrice = packagePrice + promotionPrice;
  const canPayWithBalance = userBalance >= totalPrice;

  const getPackageName = (type: string) => {
    const names: Record<string, string> = {
      'pack_3': t('listingPackages.pack3') || '3 оголошення',
      'pack_5': t('listingPackages.pack5') || '5 оголошень',
      'pack_10': t('listingPackages.pack10') || '10 оголошень',
      'pack_30': t('listingPackages.pack30') || '30 оголошень',
    };
    return names[type] || type;
  };

  const getPromotionName = (type: string) => {
    const names: Record<string, string> = {
      'highlighted': t('promotions.highlighted') || 'Виділення',
      'top_category': t('promotions.top_category') || 'ТОП категорії',
      'vip': t('promotions.vip') || 'VIP',
    };
    return names[type] || type;
  };

  return (
    <div 
      className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 pb-24 overflow-hidden ${overlay}`}
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
        className={cardShell}
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
        <div className={headerBar}>
          <div className="flex items-center justify-between">
            <h2 className={titleCls}>
              {t('payment.summary') || 'Підтвердження оплати'}
            </h2>
            <button type="button" onClick={onClose} className={closeCls} aria-label="Закрити">
              <X className="h-6 w-6" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
          {/* Деталі замовлення */}
          <div className={panel}>
            <h3 className={panelTitle}>
              {t('payment.orderDetails') || 'Деталі замовлення'}
            </h3>

            {packageType && (
              <div className="flex justify-between items-center">
                <span className={rowMuted}>
                  {t('payment.package') || 'Пакет'}: {getPackageName(packageType)}
                </span>
                <span className={rowStrong}>{packagePrice} €</span>
              </div>
            )}

            {promotionType && (
              <div className="flex justify-between items-center">
                <span className={rowMuted}>
                  {t('payment.promotion') || 'Просування'}: {getPromotionName(promotionType)}
                </span>
                <span className={rowStrong}>{promotionPrice} €</span>
              </div>
            )}

            <div className={divider}>
              <div className="flex justify-between items-center">
                <span className={totalLabel}>
                  {t('payment.total') || 'Всього'}
                </span>
                <span className={accentMoney}>{totalPrice} €</span>
              </div>
            </div>
          </div>

          {/* Баланс користувача */}
          <div className={`${panel} space-y-0`}>
            <div className="flex justify-between items-center">
              <span className={rowMuted}>
                {t('payment.yourBalance') || 'Ваш баланс'}
              </span>
              <span className={balanceAccent}>{userBalance.toFixed(2)} €</span>
            </div>
          </div>

          {/* Вибір способу оплати */}
          <div className="space-y-3">
            <h3 className={sectionHeading}>
              {t('payment.paymentMethod') || 'Спосіб оплати'}
            </h3>

            {/* Оплата з балансу */}
            <button
              type="button"
              onClick={() => setPaymentMethod('balance')}
              disabled={!canPayWithBalance}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                paymentMethod === 'balance' ? methodSelected : methodUnselected
              } ${!canPayWithBalance ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'balance' ? 'border-[#3F5331]' : radioIdle
                  }`}>
                    {paymentMethod === 'balance' && (
                      <div className="w-3 h-3 rounded-full bg-[#3F5331]" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className={labelStrong}>
                      {t('payment.payFromBalance') || 'Оплатити з балансу'}
                    </div>
                    {!canPayWithBalance && (
                      <div className={`text-sm ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                        {t('payment.insufficientBalance') || 'Недостатньо коштів'}
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-2xl">💳</span>
              </div>
            </button>

            {/* Пряма оплата */}
            <button
              type="button"
              onClick={() => setPaymentMethod('direct')}
              className={`w-full p-4 rounded-2xl border-2 transition-all ${
                paymentMethod === 'direct' ? methodSelected : methodUnselected
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === 'direct' ? 'border-[#3F5331]' : radioIdle
                  }`}>
                    {paymentMethod === 'direct' && (
                      <div className="w-3 h-3 rounded-full bg-[#3F5331]" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className={labelStrong}>
                      {t('payment.payDirect') || 'Оплатити зараз'}
                    </div>
                    <div className={labelSub}>
                      {t('payment.payDirectDesc') || 'Через Monobank'}
                    </div>
                  </div>
                </div>
                <span className="text-2xl">🏦</span>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={footerBar}>
          <button
            type="button"
            onClick={() => onConfirm(paymentMethod)}
            disabled={paymentMethod === 'balance' && !canPayWithBalance}
            className={`w-full py-4 rounded-xl font-semibold transition-all ${
              paymentMethod === 'balance' && !canPayWithBalance
                ? primaryDisabled
                : 'bg-[#3F5331] text-white hover:bg-[#344728] shadow-lg hover:shadow-xl'
            }`}
          >
            {t('payment.confirm') || `Підтвердити оплату ${totalPrice} €`}
          </button>
          <button type="button" onClick={onClose} className={cancelBtn}>
            {t('common.cancel') || 'Скасувати'}
          </button>
        </div>
      </div>
    </div>
  );
};

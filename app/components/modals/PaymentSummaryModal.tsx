'use client';

import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { useState, useEffect, useMemo } from 'react';

interface PaymentSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: 'balance' | 'direct') => void | Promise<void>;
  packageType?: string | null;
  promotionType?: string | null;
  userBalance?: number;
  tg: TelegramWebApp | null;
}

const PACKAGE_PRICES: Record<string, number> = {
  pack_3: 5.0,
  pack_5: 8.0,
  pack_10: 15.0,
  pack_30: 30.0,
};

const PROMOTION_PRICES: Record<string, number> = {
  highlighted: 1.5,
  top_category: 2.0,
  vip: 4.5,
};

function normalizeBalance(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export const PaymentSummaryModal = ({
  isOpen,
  onClose,
  onConfirm,
  packageType,
  promotionType,
  userBalance = 0,
  tg,
}: PaymentSummaryModalProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const [paymentMethod, setPaymentMethod] = useState<'balance' | 'direct'>('balance');
  const [fetchedBalance, setFetchedBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useHideBottomNav(isOpen);

  const effectiveBalance = fetchedBalance ?? normalizeBalance(userBalance);

  const packagePrice = packageType ? PACKAGE_PRICES[packageType] || 0 : 0;
  const promotionPrice = promotionType ? PROMOTION_PRICES[promotionType] || 0 : 0;
  const totalPrice = packagePrice + promotionPrice;
  const canPayWithBalance = totalPrice > 0 && effectiveBalance >= totalPrice;

  useEffect(() => {
    if (!isOpen) {
      setFetchedBalance(null);
      setBalanceLoading(false);
      setConfirming(false);
      return;
    }

    setPaymentMethod('balance');

    const telegramId =
      tg?.initDataUnsafe?.user?.id?.toString() ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('telegramId') : null);

    if (!telegramId) return;

    let cancelled = false;
    setBalanceLoading(true);

    fetch(`/api/user/balance?telegramId=${telegramId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || data?.balance == null) return;
        setFetchedBalance(normalizeBalance(data.balance));
      })
      .catch((error) => {
        console.error('[PaymentSummaryModal] Failed to fetch balance:', error);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tg]);

  useEffect(() => {
    if (!isOpen || balanceLoading) return;
    if (!canPayWithBalance && paymentMethod === 'balance') {
      setPaymentMethod('direct');
    }
  }, [isOpen, balanceLoading, canPayWithBalance, paymentMethod]);

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }

    return () => {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    };
  }, [isOpen]);

  const confirmDisabled = useMemo(() => {
    if (confirming || totalPrice <= 0) return true;
    if (paymentMethod === 'direct') return false;
    if (balanceLoading) return true;
    return !canPayWithBalance;
  }, [confirming, totalPrice, paymentMethod, balanceLoading, canPayWithBalance]);

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setConfirming(true);
    try {
      await onConfirm(paymentMethod);
    } catch (error) {
      console.error('[PaymentSummaryModal] Payment confirm failed:', error);
    } finally {
      setConfirming(false);
    }
  };

  if (!isOpen) return null;

  const overlay = isLight ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/55 backdrop-blur-sm';
  const cardShell = isLight
    ? 'bg-white rounded-2xl border border-gray-200/90 max-w-md w-full max-h-[min(90vh,calc(100dvh-2rem))] overflow-hidden flex flex-col shadow-2xl ring-1 ring-black/[0.05]'
    : 'bg-[#0a0a0a] rounded-2xl border border-white/15 max-w-md w-full max-h-[min(90vh,calc(100dvh-2rem))] overflow-hidden flex flex-col shadow-2xl';
  const headerBar = isLight
    ? 'flex-shrink-0 bg-white border-b border-gray-200/90 px-6 py-4 rounded-t-2xl'
    : 'flex-shrink-0 bg-[#0a0a0a] border-b border-white/15 px-6 py-4 rounded-t-2xl';
  const titleCls = isLight ? 'text-xl font-bold text-gray-900' : 'text-xl font-bold text-white';
  const closeCls = isLight
    ? 'text-gray-500 hover:text-gray-900 transition-colors'
    : 'text-white/70 hover:text-white transition-colors';
  const panel = isLight
    ? 'bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-200/90'
    : 'bg-[#1C1C1C] rounded-2xl p-4 space-y-3 border border-white/15';
  const panelTitle = isLight ? 'font-semibold text-gray-900 mb-3' : 'font-semibold text-white mb-3';
  const rowMuted = isLight ? 'text-gray-600' : 'text-white/70';
  const rowStrong = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const totalLabel = isLight ? 'font-bold text-gray-900 text-lg' : 'font-bold text-white text-lg';
  const accentMoney = isLight ? 'font-bold text-[#3F5331] text-xl' : 'font-bold text-[#C8E6A0] text-xl';
  const balanceAccent = isLight ? 'font-semibold text-[#3F5331] text-lg' : 'font-semibold text-[#C8E6A0] text-lg';
  const divider = isLight ? 'border-t border-gray-200/90 pt-3 mt-3' : 'border-t border-white/15 pt-3 mt-3';
  const sectionHeading = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const methodUnselected = isLight
    ? 'border-gray-200/90 bg-white hover:border-gray-300'
    : 'border-white/20 bg-[#1C1C1C] hover:border-white/35';
  const methodSelected = isLight
    ? 'border-[#3F5331] bg-[#3F5331]/10 ring-1 ring-[#3F5331]/30'
    : 'border-[#C8E6A0]/70 bg-[#3F5331]/45 ring-1 ring-[#C8E6A0]/25';
  const radioIdle = isLight ? 'border-gray-300' : 'border-white/40';
  const radioActive = isLight ? 'border-[#3F5331]' : 'border-[#C8E6A0]';
  const radioDot = isLight ? 'bg-[#3F5331]' : 'bg-[#C8E6A0]';
  const labelStrong = isLight ? 'font-semibold text-gray-900' : 'font-semibold text-white';
  const labelSub = isLight ? 'text-sm text-gray-600' : 'text-sm text-white/70';
  const footerBar = isLight
    ? 'flex-shrink-0 bg-white border-t border-gray-200/90 px-6 py-4 rounded-b-2xl space-y-2'
    : 'flex-shrink-0 bg-[#0a0a0a] border-t border-white/15 px-6 py-4 rounded-b-2xl space-y-2';
  const primaryBtn = isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728] shadow-md hover:shadow-lg'
    : 'bg-[#5A7347] text-white hover:bg-[#3F5331] shadow-md hover:shadow-lg';
  const primaryDisabled = isLight
    ? 'bg-gray-200 cursor-not-allowed text-gray-500'
    : 'bg-white/15 cursor-not-allowed text-white/45';
  const cancelBtn = isLight
    ? 'w-full py-3 rounded-xl font-semibold text-gray-900 bg-transparent border border-gray-300 hover:bg-gray-100 transition-all'
    : 'w-full py-3 rounded-xl font-semibold text-white bg-transparent border border-white/20 hover:bg-white/10 transition-all';

  const getPackageName = (type: string) => {
    const names: Record<string, string> = {
      pack_3: t('listingPackages.pack3') || '3 оголошення',
      pack_5: t('listingPackages.pack5') || '5 оголошень',
      pack_10: t('listingPackages.pack10') || '10 оголошень',
      pack_30: t('listingPackages.pack30') || '30 оголошень',
    };
    return names[type] || type;
  };

  const getPromotionName = (type: string) => {
    const names: Record<string, string> = {
      highlighted: t('promotions.highlighted') || 'Виділення',
      top_category: t('promotions.top_category') || 'ТОП категорії',
      vip: t('promotions.vip') || 'VIP',
    };
    return names[type] || type;
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[99998] ${overlay}`}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`${cardShell} pointer-events-auto`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-summary-title"
        >
          <div className={headerBar}>
            <div className="flex items-center justify-between">
              <h2 id="payment-summary-title" className={titleCls}>
                {t('payment.summary') || 'Підтвердження оплати'}
              </h2>
              <button type="button" onClick={onClose} className={closeCls} aria-label="Закрити">
                <X className="h-6 w-6" strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
            <div className={panel}>
              <h3 className={panelTitle}>{t('payment.orderDetails') || 'Деталі замовлення'}</h3>

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
                  <span className={totalLabel}>{t('payment.total') || 'Всього'}</span>
                  <span className={accentMoney}>{totalPrice} €</span>
                </div>
              </div>
            </div>

            <div className={panel}>
              <div className="flex justify-between items-center">
                <span className={rowMuted}>{t('payment.yourBalance') || 'Ваш баланс'}</span>
                <span className={balanceAccent}>
                  {balanceLoading && fetchedBalance === null
                    ? '…'
                    : `${effectiveBalance.toFixed(2)} €`}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className={sectionHeading}>{t('payment.paymentMethod') || 'Спосіб оплати'}</h3>

              <button
                type="button"
                onClick={() => canPayWithBalance && setPaymentMethod('balance')}
                disabled={!canPayWithBalance || balanceLoading}
                className={`w-full p-4 rounded-2xl border-2 transition-all ${
                  paymentMethod === 'balance' ? methodSelected : methodUnselected
                } ${!canPayWithBalance || balanceLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === 'balance' ? radioActive : radioIdle
                      }`}
                    >
                      {paymentMethod === 'balance' && <div className={`w-3 h-3 rounded-full ${radioDot}`} />}
                    </div>
                    <div className="text-left">
                      <div className={labelStrong}>{t('payment.payFromBalance') || 'Оплатити з балансу'}</div>
                      {!canPayWithBalance && !balanceLoading && (
                        <div className={`text-sm ${isLight ? 'text-red-600' : 'text-red-400'}`}>
                          {t('payment.insufficientBalance') || 'Недостатньо коштів'}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-2xl">💳</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('direct')}
                className={`w-full p-4 rounded-2xl border-2 transition-all ${
                  paymentMethod === 'direct' ? methodSelected : methodUnselected
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        paymentMethod === 'direct' ? radioActive : radioIdle
                      }`}
                    >
                      {paymentMethod === 'direct' && <div className={`w-3 h-3 rounded-full ${radioDot}`} />}
                    </div>
                    <div className="text-left">
                      <div className={labelStrong}>{t('payment.payDirect') || 'Оплатити зараз'}</div>
                      <div className={labelSub}>{t('payment.payDirectDesc') || 'Через Monobank'}</div>
                    </div>
                  </div>
                  <span className="text-2xl">🏦</span>
                </div>
              </button>
            </div>
          </div>

          <div className={footerBar}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className={`w-full py-4 rounded-xl font-semibold transition-all ${
                confirmDisabled ? primaryDisabled : primaryBtn
              }`}
            >
              {confirming
                ? t('common.loading') || 'Завантаження...'
                : t('payment.confirm') || `Підтвердити оплату ${totalPrice} €`}
            </button>
            <button type="button" onClick={onClose} className={cancelBtn} disabled={confirming}>
              {t('common.cancel') || 'Скасувати'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

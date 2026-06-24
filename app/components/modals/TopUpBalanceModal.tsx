import { X, Wallet, Loader2 } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useToast } from '@/features/ui/hooks/useToast';
import { Toast } from '@/components/ui/Toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

interface TopUpBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramId: string;
  currentBalance: number;
  onSuccess?: () => void;
  tg: TelegramWebApp | null;
}

export const TopUpBalanceModal = ({
  isOpen,
  onClose,
  telegramId,
  currentBalance,
  onSuccess,
  tg
}: TopUpBalanceModalProps) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const { t } = useLanguage();
  const { isLight } = useTheme();

  // Блокуємо скрол body та html при відкритому модальному вікні
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
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
      // Скидаємо суму при закритті
      setAmount('');
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      showToast(t('payments.invalidAmount') || 'Введіть коректну суму', 'error');
      tg?.HapticFeedback.impactOccurred('heavy');
      return;
    }

    if (amountNum < 5) {
      showToast(t('payments.minAmount') || 'Мінімальна сума поповнення: 5 EUR', 'error');
      tg?.HapticFeedback.impactOccurred('heavy');
      return;
    }

    setLoading(true);
    tg?.HapticFeedback.impactOccurred('light');

    try {
      const response = await fetch('/api/payments/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          telegramId,
          amount: amountNum,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invoice');
      }

      if (data.pageUrl) {
        // Відкриваємо посилання на оплату всередині WebApp (не закриваємо його)
        tg?.HapticFeedback.notificationOccurred('success');
        // Використовуємо window.location.href для відкриття в тому ж вікні
        window.location.href = data.pageUrl;
      } else {
        throw new Error('Payment page URL not received');
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
      const errorMessage = error instanceof Error ? error.message : 'Помилка при створенні платежу';
      showToast(errorMessage, 'error');
      tg?.HapticFeedback.notificationOccurred('error');
      setLoading(false);
    }
  };

  // Попередньо визначені суми
  const quickAmounts = [5, 10, 20, 30, 50, 100, 200];

  const sheet = isLight
    ? 'bg-white rounded-3xl border-2 border-gray-200 shadow-2xl'
    : 'bg-[#000000] rounded-3xl border-2 border-white shadow-2xl';
  const headerBorder = isLight ? 'border-gray-200' : 'border-white/20';
  const titleCls = isLight ? 'text-gray-900' : 'text-white';
  const closeBtn = isLight
    ? 'border-gray-200 text-gray-800 hover:bg-gray-100'
    : 'border-white/20 text-white hover:bg-white/10';
  const iconCircle = isLight
    ? 'bg-gray-50 border-gray-200'
    : 'bg-[#1C1C1C] border-white/20';
  const iconAccent = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const balanceBox = isLight
    ? 'bg-gray-50 border-gray-200'
    : 'bg-[#1C1C1C] border-white/20';
  const balanceLabel = isLight ? 'text-gray-600' : 'text-white/70';
  const balanceValue = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const labelCls = isLight ? 'text-gray-900' : 'text-white';
  const amountIdle = isLight
    ? 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/10';
  const amountActive = 'border-[#3F5331] bg-[#3F5331] text-white shadow-lg';
  const footerBorder = isLight ? 'border-gray-200' : 'border-white/20';
  const cancelBtn = isLight
    ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
    : 'border-white/20 text-white hover:bg-white/10';
  const submitDisabled = isLight
    ? 'disabled:bg-gray-200 disabled:text-gray-400'
    : 'disabled:bg-white/20';

  return (
    <>
      <div
        className={`fixed inset-0 z-[9998] backdrop-blur-sm ${isLight ? 'bg-black/25' : 'bg-black/50'}`}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`${sheet} w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center justify-between p-6 border-b ${headerBorder}`}>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border ${iconCircle}`}
              >
                <Wallet size={20} className={iconAccent} />
              </div>
              <h2 className={`text-xl font-bold ${titleCls}`}>
                {t('profile.topUpBalance') || 'Поповнити баланс'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`flex h-8 w-8 items-center justify-center rounded-full border bg-transparent transition-colors ${closeBtn}`}
              disabled={loading}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-6 p-6">
            <div className={`rounded-2xl border p-4 ${balanceBox}`}>
              <p className={`mb-1 text-sm ${balanceLabel}`}>
                {t('profile.balance') || 'Баланс'}
              </p>
              <p className={`text-2xl font-bold ${balanceValue}`}>
                {currentBalance.toFixed(2)} €
              </p>
            </div>

            <div>
              <label className={`mb-3 block text-sm font-semibold ${labelCls}`}>
                {t('payments.amount') || 'Сума поповнення (EUR)'}
              </label>

              <div className="grid grid-cols-3 gap-3">
                {quickAmounts.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    type="button"
                    onClick={() => {
                      setAmount(quickAmount.toString());
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`rounded-xl border-2 px-4 py-2.5 text-base font-bold transition-all ${
                      amount === quickAmount.toString() ? amountActive : amountIdle
                    }`}
                    disabled={loading}
                  >
                    {quickAmount} €
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`flex gap-3 border-t p-6 ${footerBorder}`}>
            <button
              onClick={onClose}
              className={`flex-1 rounded-xl border bg-transparent px-4 py-3 font-semibold transition-colors ${cancelBtn}`}
              disabled={loading}
            >
              {t('common.cancel') || 'Скасувати'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#3F5331] px-4 py-3 font-semibold text-white transition-colors hover:bg-[#344728] disabled:cursor-not-allowed ${submitDisabled}`}
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>{t('common.loading') || 'Завантаження...'}</span>
                </>
              ) : (
                <>
                  <Wallet size={20} />
                  <span>{t('payments.topUp') || 'Поповнити'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </>
  );
};

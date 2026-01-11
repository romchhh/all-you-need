import { X, Wallet, Loader2 } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { useLanguage } from '@/contexts/LanguageContext';

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

    if (amountNum < 1) {
      showToast(t('payments.minAmount') || 'Мінімальна сума поповнення: 1 EUR', 'error');
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
        // Перенаправляємо на сторінку оплати
        tg?.HapticFeedback.notificationOccurred('success');
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
  const quickAmounts = [10, 20, 30, 50, 100, 200];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998] backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md pointer-events-auto max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Заголовок */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Wallet size={20} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('profile.topUpBalance') || 'Поповнити баланс'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-600"
              disabled={loading}
            >
              <X size={18} />
            </button>
          </div>

          {/* Контент */}
          <div className="p-6 space-y-6">
            {/* Поточний баланс */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-sm text-gray-600 mb-1">
                {t('profile.balance') || 'Баланс'}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {currentBalance.toFixed(2)} €
              </p>
            </div>

            {/* Вибір суми */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                {t('payments.amount') || 'Сума поповнення (EUR)'}
              </label>
              
              {/* Кнопки вибору суми */}
              <div className="grid grid-cols-3 gap-3">
                {quickAmounts.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    type="button"
                    onClick={() => {
                      setAmount(quickAmount.toString());
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`px-4 py-2.5 rounded-xl border-2 font-bold text-base transition-all ${
                      amount === quickAmount.toString()
                        ? 'border-green-500 bg-green-500 text-white shadow-lg'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:bg-green-50'
                    }`}
                    disabled={loading}
                  >
                    {quickAmount} €
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Кнопки */}
          <div className="p-6 border-t border-gray-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-xl transition-colors"
              disabled={loading}
            >
              {t('common.cancel') || 'Скасувати'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="flex-1 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
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

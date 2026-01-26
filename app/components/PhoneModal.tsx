import { X, Copy, Phone } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';

interface PhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  tg: TelegramWebApp | null;
}

export const PhoneModal = ({ isOpen, onClose, phoneNumber, tg }: PhoneModalProps) => {
  const { t } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const [copied, setCopied] = useState(false);

  // Блокуємо скрол body та html при відкритому модальному вікні
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
      // Розблоковуємо скрол
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
      setCopied(false);
    }
    
    // Cleanup при розмонтуванні
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyNumber = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(phoneNumber);
        setCopied(true);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('phone.numberCopied'), 'success');
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying phone number:', error);
      if (tg) {
        tg.showAlert(t('phone.copyError'));
      } else {
        showToast(t('phone.copyError'), 'error');
      }
    }
  };

  const handleCall = () => {
    window.location.href = `tel:${phoneNumber.trim()}`;
    tg?.HapticFeedback.impactOccurred('medium');
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fadeIn">
        <div className="bg-[#000000] rounded-t-3xl border-t-2 border-white w-full max-w-md p-6 animate-slideUp">
          <div className="w-12 h-1 bg-white/30 rounded-full mx-auto mb-6"></div>
          
          {/* Хедер */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{t('phone.title')}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Номер телефону */}
          <div className="p-4 bg-[#1C1C1C] rounded-xl border border-white/20 mb-4">
            <div className="text-sm text-white/70 mb-2">{t('phone.title')}</div>
            <div className="text-lg text-white font-mono font-semibold">
              {phoneNumber}
            </div>
          </div>

          {/* Пояснювальний текст */}
          <div className="mb-4 px-2">
            <p className="text-xs text-white/50 leading-relaxed">
              {t('phone.explanation')}
            </p>
          </div>

          {/* Кнопки дій */}
          <div className="space-y-3">
            <button
              onClick={handleCall}
              className="w-full px-6 py-4 bg-[#D3F1A7] text-black rounded-2xl font-semibold hover:bg-[#D3F1A7]/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <Phone size={24} />
              <span className="text-lg">{t('phone.call')}</span>
            </button>

            <button
              onClick={handleCopyNumber}
              className="w-full flex items-center gap-4 p-4 hover:bg-white/10 rounded-xl transition-colors border border-white/20 bg-[#1C1C1C]"
            >
              <div className="w-12 h-12 bg-[#000000] border border-white/20 rounded-full flex items-center justify-center">
                <Copy className="w-6 h-6 text-white" />
              </div>
              <span className="text-white font-medium">
                {copied ? t('phone.numberCopied') : t('phone.copyNumber')}
              </span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 py-3 text-white/70 font-medium hover:text-white rounded-xl"
          >
            {t('phone.cancel')}
          </button>
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

import { X, Copy, MessageCircle, Mail, Share2 } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareLink: string;
  shareText: string;
  tg: TelegramWebApp | null;
}

export const ShareModal = ({ isOpen, onClose, shareLink, shareText, tg }: ShareModalProps) => {
  const { t } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const [showFallback, setShowFallback] = useState(false);
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

  // Використовуємо нативний Web Share API
  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareText,
          text: shareText,
          url: shareLink,
        });
        tg?.HapticFeedback.notificationOccurred('success');
        onClose();
      } else {
        // Fallback для браузерів без підтримки Web Share API
        setShowFallback(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Користувач скасував - це нормально
        console.log('Скасовано користувачем');
      } else {
        console.error('Помилка поділу:', err);
        setShowFallback(true);
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareLink);
        setCopied(true);
        tg?.HapticFeedback.notificationOccurred('success');
        setTimeout(() => {
          setCopied(false);
          setShowFallback(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying link:', error);
      if (tg) {
        tg.showAlert(t('share.copyError'));
      } else {
        showToast(t('share.copyError'), 'error');
      }
    }
  };

  const shareViaTelegram = () => {
    const text = encodeURIComponent(`${shareText}\n${shareLink}`);
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${text}`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(telegramUrl);
      tg.HapticFeedback.impactOccurred('medium');
    } else {
      window.open(telegramUrl, '_blank');
    }
    setShowFallback(false);
    onClose();
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(shareText);
    const body = encodeURIComponent(`${shareText}\n${shareLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    setShowFallback(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
          {/* Хедер */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">{t('share.title')}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X size={20} className="text-gray-900" />
            </button>
          </div>

          {/* Основна кнопка поділу */}
          <button
            onClick={handleShare}
            className="w-full px-6 py-5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl font-semibold hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 mb-4"
          >
            <Share2 size={24} />
            <span className="text-lg">{t('share.title')}</span>
          </button>

          {/* Попередній перегляд посилання */}
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle size={16} className="text-gray-400" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">{t('share.link')}</span>
            </div>
            <div className="text-sm text-gray-700 break-all font-mono bg-white p-2 rounded-lg border border-gray-200">
              {shareLink}
            </div>
          </div>
        </div>
      </div>

      {/* Fallback меню якщо Web Share API не підтримується */}
      {showFallback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end justify-center animate-fadeIn">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 animate-slideUp">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
            
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {t('share.shareVia')}
            </h3>

            <div className="space-y-2">
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                  <Copy className="w-6 h-6 text-gray-700" />
                </div>
                <span className="text-gray-800 font-medium">
                  {copied ? t('share.linkCopied') : t('share.copyLink')}
                </span>
              </button>

              <button
                onClick={shareViaTelegram}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <span className="text-gray-800 font-medium">Telegram</span>
              </button>

              <button
                onClick={shareViaEmail}
                className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 rounded-xl transition-colors"
              >
                <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <span className="text-gray-800 font-medium">{t('share.email')}</span>
              </button>
            </div>

            <button
              onClick={() => {
                setShowFallback(false);
                onClose();
              }}
              className="w-full mt-6 py-3 text-gray-600 font-medium hover:text-gray-800 rounded-xl"
            >
              {t('share.cancel')}
            </button>
          </div>
        </div>
      )}

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


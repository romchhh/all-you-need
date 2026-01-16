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
        <div className="bg-[#000000] rounded-3xl border-2 border-white w-full max-w-md p-6 shadow-2xl">
          {/* Хедер */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{t('share.title')}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Основна кнопка поділу */}
          <button
            onClick={handleShare}
            className="w-full px-6 py-5 bg-[#D3F1A7] text-black rounded-2xl font-semibold hover:bg-[#D3F1A7]/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 mb-4"
          >
            <Share2 size={24} />
            <span className="text-lg">{t('share.title')}</span>
          </button>

          {/* Попередній перегляд посилання */}
          <div className="p-3 bg-[#1C1C1C] rounded-xl border border-white/20">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle size={16} className="text-white/70" />
              <span className="text-xs text-white/70 uppercase tracking-wide">{t('share.link')}</span>
            </div>
            <div className="text-sm text-white/90 break-all font-mono bg-[#000000] p-2 rounded-lg border border-white/20">
              {shareLink}
            </div>
          </div>
        </div>
      </div>

      {/* Fallback меню якщо Web Share API не підтримується */}
      {showFallback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end justify-center animate-fadeIn">
          <div className="bg-[#000000] rounded-t-3xl border-t-2 border-white w-full max-w-md p-6 animate-slideUp">
            <div className="w-12 h-1 bg-white/30 rounded-full mx-auto mb-6"></div>
            
            <h3 className="text-lg font-semibold text-white mb-4">
              {t('share.shareVia')}
            </h3>

            <div className="space-y-2">
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/10 rounded-xl transition-colors border border-white/20 bg-[#1C1C1C]"
              >
                <div className="w-12 h-12 bg-[#000000] border border-white/20 rounded-full flex items-center justify-center">
                  <Copy className="w-6 h-6 text-white" />
                </div>
                <span className="text-white font-medium">
                  {copied ? t('share.linkCopied') : t('share.copyLink')}
                </span>
              </button>

              <button
                onClick={shareViaTelegram}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/10 rounded-xl transition-colors border border-white/20 bg-[#1C1C1C]"
              >
                <div className="w-12 h-12 bg-[#000000] border border-white/20 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <span className="text-white font-medium">Telegram</span>
              </button>

              <button
                onClick={shareViaEmail}
                className="w-full flex items-center gap-4 p-4 hover:bg-white/10 rounded-xl transition-colors border border-white/20 bg-[#1C1C1C]"
              >
                <div className="w-12 h-12 bg-[#000000] border border-white/20 rounded-full flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <span className="text-white font-medium">{t('share.email')}</span>
              </button>
            </div>

            <button
              onClick={() => {
                setShowFallback(false);
                onClose();
              }}
              className="w-full mt-6 py-3 text-white/70 font-medium hover:text-white rounded-xl"
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


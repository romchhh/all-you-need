import { X, Copy, MessageCircle, Mail, Share2, Gift, Users, Award, Coins } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { getBotStartLink } from '@/utils/botLinks';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramId: string | number;
  tg: TelegramWebApp | null;
}

export const ReferralModal = ({ isOpen, onClose, telegramId, tg }: ReferralModalProps) => {
  const { t } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{
    total_referrals: number;
    paid_referrals: number;
    total_reward: number;
  } | null>(null);

  const referralLink = getBotStartLink(`ref_${telegramId}`);
  const shareText = t('referral.shareText') || 'Приєднуйтесь до TradeGround!';

  // Завантажуємо статистику рефералів
  useEffect(() => {
    if (isOpen && telegramId) {
      fetch(`/api/referral/stats?telegramId=${telegramId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setStats(data.stats);
          }
        })
        .catch(err => console.error('Error fetching referral stats:', err));
    }
  }, [isOpen, telegramId]);

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

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareText,
          text: shareText,
          url: referralLink,
        });
        tg?.HapticFeedback.notificationOccurred('success');
        onClose();
      } else {
        setShowFallback(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
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
        await navigator.clipboard.writeText(referralLink);
        setCopied(true);
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('share.linkCopied'), 'success');
        setTimeout(() => {
          setCopied(false);
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
    const text = encodeURIComponent(`${shareText}\n${referralLink}`);
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(telegramUrl);
      tg.HapticFeedback.impactOccurred('medium');
    } else {
      window.open(telegramUrl, '_blank');
    }
    setShowFallback(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-end justify-center animate-fadeIn">
        <div className="bg-[#000000] rounded-t-3xl border-t-2 border-white w-full max-w-md p-6 animate-slideUp max-h-[90vh] overflow-y-auto">
          <div className="w-12 h-1 bg-white/30 rounded-full mx-auto mb-6"></div>
          
          {/* Хедер */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{t('referral.title')}</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Опис */}
          <div className="mb-4 px-2">
            <p className="text-xs text-white/50 leading-relaxed whitespace-pre-line">
              {t('referral.description')}
            </p>
          </div>

          {/* Статистика */}
          {stats && (
            <div className="mb-4 p-3 bg-[#1C1C1C] rounded-xl border border-white/20">
              <h3 className="text-white text-xs font-semibold mb-2">{t('referral.statsTitle')}</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-2 bg-[#000000] rounded-lg border border-white/10">
                  <Users size={16} className="text-white/70 mb-1" />
                  <span className="text-white text-base font-bold">{stats.total_referrals}</span>
                  <span className="text-white/60 text-[10px] text-center leading-tight mt-0.5">{t('referral.totalReferrals')}</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-[#000000] rounded-lg border border-white/10">
                  <Award size={16} className="text-white/70 mb-1" />
                  <span className="text-white text-base font-bold">{stats.paid_referrals}</span>
                  <span className="text-white/60 text-[10px] text-center leading-tight mt-0.5">{t('referral.paidReferrals')}</span>
                </div>
                <div className="flex flex-col items-center p-2 bg-[#000000] rounded-lg border border-white/10">
                  <Coins size={16} className="text-[#D3F1A7] mb-1" />
                  <span className="text-[#D3F1A7] text-base font-bold">{stats.total_reward.toFixed(2)}€</span>
                  <span className="text-white/60 text-[10px] text-center leading-tight mt-0.5">{t('referral.totalReward')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Попередній перегляд посилання */}
          <div className="p-4 bg-[#1C1C1C] rounded-xl border border-white/20 mb-4">
            <div className="text-sm text-white/70 mb-2">{t('share.link')}</div>
            <div className="text-sm text-white font-mono font-semibold break-all">
              {referralLink}
            </div>
          </div>

          {/* Кнопки дій */}
          <div className="space-y-3">
            <button
              onClick={handleShare}
              className="w-full px-6 py-4 bg-[#D3F1A7] text-black rounded-2xl font-semibold hover:bg-[#D3F1A7]/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <Share2 size={24} />
              <span className="text-lg">{t('referral.shareButton')}</span>
            </button>

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
          </div>
        </div>
      </div>

      {/* Fallback меню */}
      {showFallback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-end justify-center animate-fadeIn">
          <div className="bg-[#000000] rounded-t-3xl border-t-2 border-white w-full max-w-md p-6 animate-slideUp">
            <div className="w-12 h-1 bg-white/30 rounded-full mx-auto mb-6"></div>
            
            <h3 className="text-lg font-semibold text-white mb-4">
              {t('share.shareVia')}
            </h3>

            <div className="space-y-3">
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
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </>
  );
};

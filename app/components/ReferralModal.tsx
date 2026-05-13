import { X, Copy, MessageCircle, Share2, Users, Award, Coins } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { getBotStartLink } from '@/utils/botLinks';
import { useTheme } from '@/contexts/ThemeContext';

interface ReferralModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramId: string | number;
  tg: TelegramWebApp | null;
}

export const ReferralModal = ({ isOpen, onClose, telegramId, tg }: ReferralModalProps) => {
  const { t } = useLanguage();
  const { isLight } = useTheme();
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
      showToast(t('share.copyError'), 'error');
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

  const sheet = isLight
    ? 'bg-white rounded-t-3xl border-t-2 border-gray-200 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]'
    : 'bg-[#000000] rounded-t-3xl border-t-2 border-white';
  const handleBar = isLight ? 'bg-gray-300' : 'bg-white/30';
  const titleCls = isLight ? 'text-gray-900' : 'text-white';
  const closeBtn = isLight
    ? 'bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-900'
    : 'bg-[#1C1C1C] border border-white/20 hover:bg-white/10 text-white';
  const descCls = isLight ? 'text-gray-600' : 'text-white/50';
  const statBox = isLight
    ? 'bg-gray-50 border border-gray-200'
    : 'bg-[#1C1C1C] border border-white/20';
  const statCard = isLight
    ? 'bg-white border border-gray-200'
    : 'bg-[#000000] border border-white/10';
  const statIconMuted = isLight ? 'text-gray-500' : 'text-white/70';
  const statValue = isLight ? 'text-gray-900' : 'text-white';
  const statLabel = isLight ? 'text-gray-600' : 'text-white/60';
  const accentCoin = 'text-[#5a7c2e]';
  const accentCoinDark = 'text-[#C8E6A0]';
  const linkBox = isLight
    ? 'bg-gray-50 border border-gray-200'
    : 'bg-[#1C1C1C] border border-white/20';
  const linkLabel = isLight ? 'text-gray-600' : 'text-white/70';
  const linkText = isLight ? 'text-gray-900' : 'text-white';
  const secondaryRow = isLight
    ? 'border border-gray-200 bg-white hover:bg-gray-50'
    : 'border border-white/20 bg-[#1C1C1C] hover:bg-white/10';
  const iconCircle = isLight
    ? 'bg-gray-100 border border-gray-200'
    : 'bg-[#000000] border border-white/20';
  const iconInCircle = isLight ? 'text-gray-800' : 'text-white';

  return (
    <>
      <div
        className={`fixed inset-0 backdrop-blur-sm z-[100] flex items-end justify-center animate-fadeIn ${
          isLight ? 'bg-black/25' : 'bg-black/50'
        }`}
      >
        <div
          className={`${sheet} w-full max-w-md p-6 animate-slideUp max-h-[90vh] overflow-y-auto`}
        >
          <div className={`w-12 h-1 ${handleBar} rounded-full mx-auto mb-6`} />
          
          {/* Хедер */}
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl font-bold ${titleCls}`}>{t('referral.title')}</h2>
            <button
              onClick={onClose}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${closeBtn}`}
            >
              <X size={20} className={isLight ? 'text-gray-800' : 'text-white'} />
            </button>
          </div>

          {/* Опис */}
          <div className="mb-4 px-2">
            <p className={`text-xs leading-relaxed whitespace-pre-line ${descCls}`}>
              {t('referral.description')}
            </p>
          </div>

          {/* Статистика */}
          {stats && (
            <div className={`mb-4 p-3 rounded-xl ${statBox}`}>
              <h3 className={`text-xs font-semibold mb-2 ${titleCls}`}>{t('referral.statsTitle')}</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className={`flex flex-col items-center p-2 rounded-lg ${statCard}`}>
                  <Users size={16} className={`${statIconMuted} mb-1`} />
                  <span className={`text-base font-bold ${statValue}`}>{stats.total_referrals}</span>
                  <span className={`${statLabel} text-[10px] text-center leading-tight mt-0.5`}>{t('referral.totalReferrals')}</span>
                </div>
                <div className={`flex flex-col items-center p-2 rounded-lg ${statCard}`}>
                  <Award size={16} className={`${statIconMuted} mb-1`} />
                  <span className={`text-base font-bold ${statValue}`}>{stats.paid_referrals}</span>
                  <span className={`${statLabel} text-[10px] text-center leading-tight mt-0.5`}>{t('referral.paidReferrals')}</span>
                </div>
                <div className={`flex flex-col items-center p-2 rounded-lg ${statCard}`}>
                  <Coins size={16} className={`${isLight ? accentCoin : accentCoinDark} mb-1`} />
                  <span className={`text-base font-bold ${isLight ? accentCoin : accentCoinDark}`}>{stats.total_reward.toFixed(2)}€</span>
                  <span className={`${statLabel} text-[10px] text-center leading-tight mt-0.5`}>{t('referral.totalReward')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Попередній перегляд посилання */}
          <div className={`p-4 rounded-xl mb-4 ${linkBox}`}>
            <div className={`text-sm mb-2 ${linkLabel}`}>{t('share.link')}</div>
            <div className={`text-sm font-mono font-semibold break-all ${linkText}`}>
              {referralLink}
            </div>
          </div>

          {/* Кнопки дій */}
          <div className="space-y-3">
            <button
              onClick={handleShare}
              className="w-full px-6 py-4 bg-[#3F5331] text-white rounded-2xl font-semibold hover:bg-[#344728] transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              <Share2 size={24} />
              <span className="text-lg">{t('referral.shareButton')}</span>
            </button>

            <button
              onClick={handleCopyLink}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${secondaryRow}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconCircle}`}>
                <Copy className={`w-6 h-6 ${iconInCircle}`} />
              </div>
              <span className={`font-medium ${titleCls}`}>
                {copied ? t('share.linkCopied') : t('share.copyLink')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Fallback меню */}
      {showFallback && (
        <div
          className={`fixed inset-0 backdrop-blur-sm z-[110] flex items-end justify-center animate-fadeIn ${
            isLight ? 'bg-black/25' : 'bg-black/50'
          }`}
        >
          <div className={`${sheet} w-full max-w-md p-6 animate-slideUp`}>
            <div className={`w-12 h-1 ${handleBar} rounded-full mx-auto mb-6`} />
            
            <h3 className={`text-lg font-semibold mb-4 ${titleCls}`}>
              {t('share.shareVia')}
            </h3>

            <div className="space-y-3">
              <button
                onClick={handleCopyLink}
                className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${secondaryRow}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconCircle}`}>
                  <Copy className={`w-6 h-6 ${iconInCircle}`} />
                </div>
                <span className={`font-medium ${titleCls}`}>
                  {copied ? t('share.linkCopied') : t('share.copyLink')}
                </span>
              </button>

              <button
                onClick={shareViaTelegram}
                className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${secondaryRow}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconCircle}`}>
                  <MessageCircle className={`w-6 h-6 ${iconInCircle}`} />
                </div>
                <span className={`font-medium ${titleCls}`}>Telegram</span>
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

'use client';

import { Coins, Gift, Link2, Megaphone, UserPlus } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

type ReferralOnboardingPanelProps = {
  onOpenReferral: () => void;
};

export function ReferralOnboardingPanel({ onOpenReferral }: ReferralOnboardingPanelProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const ctaClass = isLight
    ? 'w-full rounded-2xl bg-[#3F5331] px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#344728]'
    : 'w-full rounded-2xl bg-[#C8E6A0] px-4 py-3.5 text-sm font-semibold text-[#0f1408] transition-opacity hover:opacity-90';

  const stepKeys = ['share', 'register', 'listing', 'reward'] as const;

  return (
    <div className="space-y-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className={`rounded-2xl border p-4 ${
          isLight ? 'border-[#3F5331]/15 bg-[#E8F0E0]/50' : 'border-[#C8E6A0]/15 bg-[#C8E6A0]/5'
        }`}
      >
        <div className="mb-3 flex items-center gap-2">
          <Gift size={20} className={isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'} />
          <p className={`text-sm font-bold ${ac.pageHeading}`}>
            {t('platformTicker.onboarding.referralDetail.heroTitle')}
          </p>
        </div>
        <p className={`text-sm leading-relaxed ${ac.mutedText}`}>
          {t('platformTicker.onboarding.referralDetail.lead')}
        </p>
      </div>

      <div
        className={`overflow-hidden rounded-2xl border ${
          isLight ? 'border-gray-200 bg-white shadow-sm' : 'border-white/10 bg-[#141414]'
        }`}
        aria-hidden
      >
        <div className={`border-b px-3 py-2.5 ${isLight ? 'border-gray-100 bg-gray-50' : 'border-white/10 bg-white/[0.04]'}`}>
          <p className={`text-xs font-semibold ${ac.pageHeading}`}>
            {t('platformTicker.onboarding.referralDetail.mockupTitle')}
          </p>
        </div>
        <div className="space-y-2 p-3">
          <div className={`rounded-xl p-3 ${isLight ? 'bg-gray-50' : 'bg-white/[0.05]'}`}>
            <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-medium ${ac.mutedText}`}>
              <Link2 size={12} />
              {t('share.link')}
            </div>
            <p className={`truncate font-mono text-[11px] ${ac.pageHeading}`}>
              t.me/TradeGroundBot?start=ref_•••••
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { icon: UserPlus, value: '3', label: t('referral.totalReferrals') },
              { icon: Megaphone, value: '2', label: t('referral.paidReferrals') },
              { icon: Coins, value: '2€', label: t('referral.totalReward') },
            ].map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className={`rounded-lg px-1 py-2 text-center ${isLight ? 'bg-gray-50' : 'bg-white/[0.05]'}`}
              >
                <Icon size={14} className={`mx-auto mb-1 ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`} />
                <p className={`text-sm font-bold tabular-nums ${ac.pageHeading}`}>{value}</p>
                <p className={`mt-0.5 text-[8px] leading-tight ${ac.mutedText}`}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className={`mb-2 text-sm font-semibold ${ac.pageHeading}`}>
          {t('platformTicker.onboarding.referralDetail.howTitle')}
        </h3>
        <ol className="space-y-2.5">
          {stepKeys.map((key, index) => (
            <li
              key={key}
              className={`flex gap-3 rounded-xl px-3 py-2.5 ${
                isLight ? 'bg-gray-50/90' : 'bg-white/[0.04]'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0] text-[#0f1408]'
                }`}
              >
                {index + 1}
              </span>
              <p className={`text-xs leading-relaxed ${ac.mutedText}`}>
                {t(`platformTicker.onboarding.referralDetail.steps.${key}`)}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <p className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${isLight ? 'bg-amber-50 text-amber-900/90' : 'bg-amber-500/10 text-amber-100/90'}`}>
        {t('platformTicker.onboarding.referralDetail.important')}
      </p>

      <p className={`text-xs leading-relaxed ${ac.mutedText}`}>
        {t('platformTicker.onboarding.referralDetail.balanceNote')}
      </p>

      <button type="button" onClick={onOpenReferral} className={ctaClass}>
        {t('platformTicker.onboarding.referralDetail.cta')}
      </button>
    </div>
  );
}

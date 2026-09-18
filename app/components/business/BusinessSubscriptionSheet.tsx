'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clover,
  CreditCard,
  Crown,
  Heart,
  Percent,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import {
  BUSINESS_PLANS,
  BUSINESS_PLAN_MONTHLY_CREDITS,
  type BusinessPlanId,
} from '@/lib/businessProfileConstants';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { BusinessProfileData } from '@/components/business/BusinessOwnerProfileView';

interface BusinessSubscriptionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  businessProfile: BusinessProfileData;
  onChangePlan: () => void;
  onCancelSubscription?: () => void;
}

function formatSubscriptionDate(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function BusinessSubscriptionSheet({
  isOpen,
  onClose,
  businessProfile,
  onChangePlan,
  onCancelSubscription,
}: BusinessSubscriptionSheetProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const ui = getBusinessProfileUi(isLight);

  useBodyScrollLock(isOpen);
  useHideBottomNav(isOpen);

  if (!isOpen) return null;

  const isPro = businessProfile.plan === 'business_pro';
  const planId = (isPro ? 'business_pro' : 'business') as BusinessPlanId;
  const plan = BUSINESS_PLANS[planId];
  const planCredits = BUSINESS_PLAN_MONTHLY_CREDITS[planId];
  const highlightRemaining = businessProfile.highlightCreditsRemaining ?? 0;
  const topRemaining = businessProfile.topCreditsRemaining ?? 0;
  const promoDiscount = isPro ? 20 : 10;
  const renewalDate = businessProfile.subscriptionEndsAt
    ? formatSubscriptionDate(businessProfile.subscriptionEndsAt, language)
    : null;

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const headerBorder = ui.divider;

  const perkRows = [
    {
      icon: Zap,
      label: t('businessProfile.owner.highlightSlots'),
      value: `${highlightRemaining} / ${planCredits.highlight}`,
      hint: t('businessProfile.subscription.perkRenewal', { date: renewalDate ?? '—' }),
    },
    ...(planCredits.top > 0
      ? [
          {
            icon: Crown,
            label: t('businessProfile.owner.topSlots'),
            value: `${topRemaining} / ${planCredits.top}`,
            hint: t('businessProfile.subscription.perkRenewal', { date: renewalDate ?? '—' }),
          },
        ]
      : []),
    {
      icon: Percent,
      label: t('businessProfile.subscription.discountLabel'),
      value: `${promoDiscount}%`,
      hint: t('businessProfile.owner.promoDiscount', { percent: String(promoDiscount) }),
    },
  ];

  return (
    <div className="fixed inset-0 z-[99990] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`relative z-10 flex max-h-[min(92dvh,760px)] w-full flex-col overflow-hidden rounded-t-[1.75rem] shadow-2xl ${shell}`}
      >
        <div
          className={`flex shrink-0 items-center justify-between border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${headerBorder}`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`-ml-2 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
          >
            <ChevronLeft size={22} />
          </button>
          <h2 className={`text-base font-bold ${ac.pageHeading}`}>{t('businessProfile.subscription.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={`-mr-2 rounded-full p-2 ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className={`${ui.cardShell} p-4`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
                  {t('businessProfile.subscription.currentPlan')}
                </p>
                <p className={`mt-1 text-lg font-bold ${ac.pageHeading}`}>{t(plan.labelKey)}</p>
                <p className={`mt-0.5 text-sm font-semibold ${ui.limeText}`}>
                  {plan.price.toFixed(2)} € / {t('businessProfile.tariff.month')}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.limeBgSoft} ${ui.limeText}`}>
                <Check size={14} />
                {t('businessProfile.subscription.active')}
              </span>
            </div>
            {renewalDate ? (
              <p className={`text-sm ${ac.mutedText}`}>
                {t('businessProfile.subscription.renewsOn', { date: renewalDate })}
              </p>
            ) : null}
          </div>

          <div className={`${ui.cardShell} p-4`}>
            <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
              {t('businessProfile.subscription.inYourPlan')}
            </p>
            <div className="space-y-3">
              {perkRows.map(({ icon: Icon, label, value, hint }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ui.limeBgSoft}`}>
                    <Icon size={18} className={ui.limeText} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-semibold ${ac.pageHeading}`}>{label}</span>
                      <span className={`text-sm font-bold tabular-nums ${ui.limeText}`}>{value}</span>
                    </div>
                    <p className={`mt-0.5 text-xs ${ac.mutedText}`}>{hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={onChangePlan} className={`${ui.btnOutline} w-full`}>
            {t('businessProfile.subscription.changePlan')}
            <ChevronRight size={18} />
          </button>

          <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
            <div className="px-4 py-3.5">
              <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
                {t('businessProfile.subscription.paymentSection')}
              </p>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ui.limeBgSoft}`}>
                  <CreditCard size={18} className={ui.limeText} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${ac.pageHeading}`}>
                    {t('businessProfile.subscription.paymentMethod')}
                  </p>
                  <p className={`text-xs ${ac.mutedText}`}>{t('businessProfile.subscription.cardEnding')}</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`flex w-full items-center justify-between px-4 py-3.5 text-left ${isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'}`}
            >
              <span className={`text-sm ${ac.pageHeading}`}>{t('businessProfile.subscription.paymentHistory')}</span>
              <ChevronRight size={18} className={ac.mutedText} />
            </button>
          </div>

          {onCancelSubscription ? (
            <button type="button" onClick={onCancelSubscription} className={ui.btnDangerOutline}>
              {t('businessProfile.subscription.cancel')}
            </button>
          ) : null}

          <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${ui.limeBgSoft} ${ui.limeText}`}>
            <Clover size={14} className="mt-0.5 shrink-0" />
            <span>{t('businessProfile.tariff.disclaimer')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
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
  formatBusinessPlanPrice,
  parsePlanFeatureLines,
  type BusinessPlanId,
} from '@/lib/businessProfileConstants';
import { getBusinessProfileUi } from '@/components/business/businessProfileUi';
import type { BusinessProfileData } from '@/components/business/BusinessOwnerProfileView';
import { IosSwitch } from '@/components/ui/IosSwitch';

interface BusinessSubscriptionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  businessProfile: BusinessProfileData;
  telegramId: string;
  onChangePlan: () => void;
  onProfileRefresh?: () => void;
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
  telegramId,
  onChangePlan,
  onProfileRefresh,
}: BusinessSubscriptionSheetProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const planLang = language === 'ru' ? 'ru' : 'uk';
  const ui = getBusinessProfileUi(isLight);
  const [autoRenewSaving, setAutoRenewSaving] = useState(false);

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
  const autoRenew = businessProfile.subscriptionAutoRenew ?? true;
  const showPaymentBlocks = isPro || Boolean(businessProfile.hasProPaymentHistory);

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const headerBorder = ui.divider;

  const sheetTitle = isPro
    ? t('businessProfile.subscription.manageSubscriptionTitle')
    : t('businessProfile.subscription.manageTariffTitle');

  const freeFeatures = parsePlanFeatureLines(t('businessProfile.subscription.freeManageFeatures'));
  const proCapabilities = parsePlanFeatureLines(t('businessProfile.subscription.proCapabilities'));

  const handleAutoRenewToggle = async (next: boolean) => {
    if (!telegramId || autoRenewSaving) return;
    setAutoRenewSaving(true);
    try {
      const res = await fetch('/api/user/business-profile/auto-renew', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, autoRenew: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[auto-renew]', data.error || res.status);
        return;
      }
      onProfileRefresh?.();
    } finally {
      setAutoRenewSaving(false);
    }
  };

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
          <h2 className={`text-base font-bold ${ac.pageHeading}`}>{sheetTitle}</h2>
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
                  {isPro ? formatBusinessPlanPrice(planId, planLang) : t('businessProfile.tariff.free')}
                </p>
                {!isPro ? (
                  <p className={`mt-1 text-sm ${ac.mutedText}`}>
                    {t('businessProfile.subscription.freePlanForever')}
                  </p>
                ) : renewalDate ? (
                  <p className={`mt-1 text-sm ${ac.mutedText}`}>
                    {t('businessProfile.subscription.renewsOn', { date: renewalDate })}
                  </p>
                ) : null}
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.limeBgSoft} ${ui.limeText}`}
              >
                <Check size={14} />
                {t('businessProfile.subscription.activeBadge')}
              </span>
            </div>
          </div>

          <div className={`${ui.cardShell} p-4`}>
            <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
              {t('businessProfile.subscription.inYourPlan')}
            </p>

            {isPro ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Zap size={18} className={ui.limeText} />
                    <span className={`text-sm font-semibold ${ac.pageHeading}`}>
                      {t('businessProfile.owner.highlightSlots')}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${ui.limeText}`}>
                    {t('businessProfile.subscription.creditsLeft', {
                      remaining: String(highlightRemaining),
                      total: String(planCredits.highlight),
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Crown size={18} className={ui.limeText} />
                    <span className={`text-sm font-semibold ${ac.pageHeading}`}>
                      {t('businessProfile.owner.topSlots')}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${ui.limeText}`}>
                    {t('businessProfile.subscription.creditsLeft', {
                      remaining: String(topRemaining),
                      total: String(planCredits.top),
                    })}
                  </span>
                </div>
                <div className={`flex items-center justify-between gap-3 border-t pt-4 ${ui.divider}`}>
                  <span className={`text-sm font-semibold ${ac.pageHeading}`}>
                    {t('businessProfile.subscription.discountLabel')}
                    <span className={`mt-0.5 block text-xs font-normal ${ac.mutedText}`}>
                      {t('businessProfile.owner.promoDiscountShort')}
                    </span>
                  </span>
                  <span className={`text-lg font-bold ${ui.limeText}`}>{promoDiscount}%</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${ui.limeBgSoft} ${ui.limeText}`}
                >
                  {promoDiscount}%
                </div>
                <div>
                  <p className={`text-sm font-semibold ${ac.pageHeading}`}>
                    {t('businessProfile.subscription.discountLabel')}
                  </p>
                  <p className={`text-sm ${ac.mutedText}`}>{t('businessProfile.owner.promoDiscountShort')}</p>
                </div>
              </div>
            )}

            {!isPro ? (
              <ul className={`mt-4 space-y-1.5 border-t pt-4 ${ui.divider}`}>
                {freeFeatures.map((line) => (
                  <li key={line} className={`flex gap-2 text-sm ${ac.mutedText}`}>
                    <Check size={14} className={`mt-0.5 shrink-0 ${ui.limeText}`} />
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {isPro ? (
            <div className={`${ui.cardShell} p-4`}>
              <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
                {t('businessProfile.subscription.planCapabilities')}
              </p>
              <ul className="space-y-1.5">
                {proCapabilities.map((line) => (
                  <li key={line} className={`flex gap-2 text-sm ${ac.mutedText}`}>
                    <Check size={14} className={`mt-0.5 shrink-0 ${ui.limeText}`} />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="button" onClick={onChangePlan} className={`${ui.btnOutline} w-full`}>
            {isPro ? t('businessProfile.subscription.changePlan') : t('businessProfile.subscription.upgradeToProCta')}
            <ChevronRight size={18} />
          </button>

          {showPaymentBlocks ? (
            <div className={`${ui.cardShell} divide-y ${ui.divider}`}>
              <div className="px-4 py-3.5">
                <p className={`mb-3 text-xs font-semibold uppercase tracking-wide ${ac.mutedText}`}>
                  {t('businessProfile.subscription.paymentSection')}
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ui.limeBgSoft}`}
                  >
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
          ) : null}

          {isPro ? (
            <div className={`${ui.cardShell} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm font-semibold ${ac.pageHeading}`}>
                  {t('businessProfile.subscription.autoRenew')}
                </span>
                <IosSwitch
                  checked={autoRenew}
                  disabled={autoRenewSaving}
                  onChange={handleAutoRenewToggle}
                  aria-label={t('businessProfile.subscription.autoRenew')}
                />
              </div>
              {renewalDate ? (
                <p className={`mt-3 text-sm ${ac.mutedText}`}>
                  {autoRenew
                    ? t('businessProfile.subscription.renewsOn', { date: renewalDate })
                    : t('businessProfile.subscription.validUntil', { date: renewalDate })}
                </p>
              ) : null}
              {!autoRenew ? (
                <p className={`mt-2 text-xs leading-relaxed ${ac.mutedText}`}>
                  {t('businessProfile.subscription.afterPeriodFreeBusiness')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

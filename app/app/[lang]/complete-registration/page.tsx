'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TradeGroundLogo } from '@/components/TradeGroundLogo';
import { useParams, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  Smartphone,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTelegram } from '@/hooks/useTelegram';
import { getBotTelegramOpenUrl } from '@/utils/botLinks';

function StepCard({
  done,
  icon: Icon,
  text,
  doneLabel,
  isLight,
}: {
  done: boolean;
  icon: LucideIcon;
  text: string;
  doneLabel: string;
  isLight: boolean;
}) {
  return (
    <div
      className={`flex gap-4 rounded-2xl border p-4 transition-colors ${
        done
          ? isLight
            ? 'border-emerald-300/80 bg-emerald-50/90'
            : 'border-emerald-400/35 bg-emerald-500/[0.12]'
          : isLight
            ? 'border-gray-200 bg-gray-50/90'
            : 'border-white/[0.08] bg-black/25'
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          done
            ? isLight
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-emerald-500/25 text-[#C8E6A0]'
            : isLight
              ? 'bg-gray-100 text-gray-500'
              : 'bg-white/[0.06] text-white/45'
        }`}
      >
        {done ? <Check size={22} strokeWidth={2.5} /> : <Icon size={22} strokeWidth={1.8} />}
      </div>
      <div className="min-w-0 flex-1 text-left pt-0.5">
        <p
          className={`text-sm font-medium leading-snug ${
            done
              ? isLight
                ? 'text-emerald-950'
                : 'text-emerald-50/95'
              : isLight
                ? 'text-gray-800'
                : 'text-white/88'
          }`}
        >
          {text}
        </p>
        {done && (
          <p
            className={`mt-1 text-xs font-medium ${
              isLight ? 'text-emerald-700' : 'text-emerald-300/80'
            }`}
          >
            {doneLabel}
          </p>
        )}
      </div>
    </div>
  );
}

export default function CompleteRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  const { t, setLanguage } = useLanguage();
  const { isLight } = useTheme();
  const { profile, loading, refetch, isRegistrationIncomplete } = useUser();
  const { tg } = useTelegram();

  useEffect(() => {
    if (lang === 'uk' || lang === 'ru') {
      setLanguage(lang);
    }
  }, [lang, setLanguage]);

  useEffect(() => {
    if (loading || !profile) return;
    if (!isRegistrationIncomplete) {
      router.replace(`/${lang}/bazaar`);
    }
  }, [loading, profile, isRegistrationIncomplete, lang, router]);

  const agreed = profile?.agreementAccepted === true;
  const hasContact = Boolean(profile?.phone?.trim() || profile?.username?.trim());

  const openBot = () => {
    const url = getBotTelegramOpenUrl();
    const w = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
    w?.HapticFeedback?.impactOccurred('medium');

    const closeMiniApp = () => {
      try {
        w?.close?.();
      } catch {
        /* ignore */
      }
    };

    if (w?.openTelegramLink) {
      w.openTelegramLink(url);
      window.setTimeout(closeMiniApp, 400);
      return;
    }
    if (w?.openLink) {
      w.openLink(url);
      window.setTimeout(closeMiniApp, 400);
      return;
    }
    window.location.href = url;
  };

  const pageBg = isLight
    ? 'radial-gradient(ellipse 90% 120% at 14% -8%, rgba(63, 83, 49, 0.1) 0%, transparent 52%), linear-gradient(180deg, #ffffff 0%, #f5f6f3 100%)'
    : 'radial-gradient(ellipse 85% 55% at 50% -10%, rgba(63, 83, 49, 0.55) 0%, transparent 55%), radial-gradient(ellipse 70% 45% at 100% 80%, rgba(63, 83, 49, 0.35) 0%, transparent 50%), #000000';

  return (
    <div className="min-h-screen overflow-x-hidden pb-28 font-montserrat" style={{ background: pageBg }}>
      <div className="mx-auto flex max-w-lg flex-col px-4 pt-[calc(1.5rem+1mm)]">
        <div className="mb-6 flex justify-center">
          <TradeGroundLogo imageOpacity={0.98} />
        </div>

        <div className="mb-5 flex justify-center">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide backdrop-blur-sm ${
              isLight
                ? 'border-[#3F5331]/25 bg-[#3F5331]/12 text-[#1e3d1a]'
                : 'border-[#5a7349]/45 bg-[#3F5331]/35 text-[#E8F5D4]/95'
            }`}
          >
            <Shield size={14} className={`shrink-0 ${isLight ? 'text-[#3F5331]' : 'opacity-90'}`} />
            {t('completeRegistration.badge')}
          </span>
        </div>

        <h1 className={`mb-3 text-center text-2xl font-bold leading-tight ${isLight ? 'text-gray-900' : 'text-white'}`}>
          {t('completeRegistration.title')}
        </h1>
        <p className={`mb-8 text-center text-sm leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/65'}`}>
          {t('completeRegistration.intro')}
        </p>

        <div
          className={`space-y-3 rounded-3xl border p-4 backdrop-blur-md ${
            isLight
              ? 'border-gray-200/90 bg-white/90 shadow-md shadow-gray-900/[0.06] ring-1 ring-black/[0.03]'
              : 'border-white/[0.1] bg-white/[0.04] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]'
          }`}
        >
          <StepCard
            done={agreed}
            icon={FileText}
            text={t('completeRegistration.stepAgreement')}
            doneLabel={t('completeRegistration.stepDone')}
            isLight={isLight}
          />
          <StepCard
            done={hasContact}
            icon={Smartphone}
            text={t('completeRegistration.stepContact')}
            doneLabel={t('completeRegistration.stepDone')}
            isLight={isLight}
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              openBot();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3F5331] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#344728] active:bg-[#2d3d26]"
          >
            <ExternalLink size={18} strokeWidth={2.2} />
            {t('completeRegistration.openBot')}
          </button>

          <Link
            href={`/${lang}/oferta`}
            onClick={() => tg?.HapticFeedback?.impactOccurred('light')}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold transition-colors ${
              isLight
                ? 'border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-50 active:bg-gray-100'
                : 'border-white/20 bg-white/[0.06] text-white/90 hover:bg-white/[0.1] active:bg-white/[0.08]'
            }`}
          >
            <FileText size={18} strokeWidth={2} />
            {t('completeRegistration.ofertaLink')}
          </Link>

          <button
            type="button"
            onClick={() => {
              refetch();
              tg?.HapticFeedback?.impactOccurred('light');
            }}
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-semibold transition-colors disabled:opacity-45 ${
              isLight
                ? 'border-gray-300 bg-transparent text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                : 'border-white/15 bg-transparent text-white/80 hover:border-white/25 hover:bg-white/[0.05]'
            }`}
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} strokeWidth={2.2} />
            )}
            {loading ? t('common.loading') : t('completeRegistration.refresh')}
          </button>
        </div>

        <p className={`mt-8 text-center text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-white/45'}`}>
          {t('completeRegistration.hint')}
        </p>
        <p className={`mt-4 text-center text-xs ${isLight ? 'text-gray-400' : 'text-white/35'}`}>{t('menu.support')}</p>
      </div>
    </div>
  );
}

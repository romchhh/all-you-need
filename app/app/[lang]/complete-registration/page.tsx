'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
import { useTelegram } from '@/hooks/useTelegram';
import { getBotTelegramOpenUrl } from '@/utils/botLinks';

function StepCard({
  done,
  icon: Icon,
  text,
  doneLabel,
}: {
  done: boolean;
  icon: LucideIcon;
  text: string;
  doneLabel: string;
}) {
  return (
    <div
      className={`flex gap-4 rounded-2xl border p-4 transition-colors ${
        done
          ? 'border-emerald-400/35 bg-emerald-500/[0.12]'
          : 'border-white/[0.08] bg-black/25'
      }`}
    >
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          done ? 'bg-emerald-500/25 text-[#D3F1A7]' : 'bg-white/[0.06] text-white/45'
        }`}
      >
        {done ? <Check size={22} strokeWidth={2.5} /> : <Icon size={22} strokeWidth={1.8} />}
      </div>
      <div className="min-w-0 flex-1 text-left pt-0.5">
        <p
          className={`text-sm font-medium leading-snug ${
            done ? 'text-emerald-50/95' : 'text-white/88'
          }`}
        >
          {text}
        </p>
        {done && (
          <p className="mt-1 text-xs font-medium text-emerald-300/80">{doneLabel}</p>
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

  return (
    <div
      className="min-h-screen overflow-x-hidden pb-28 font-montserrat"
      style={{
        background:
          'radial-gradient(ellipse 85% 55% at 50% -10%, rgba(63, 83, 49, 0.55) 0%, transparent 55%), radial-gradient(ellipse 70% 45% at 100% 80%, rgba(63, 83, 49, 0.35) 0%, transparent 50%), #000000',
      }}
    >
      <div className="mx-auto flex max-w-lg flex-col px-4 pt-[calc(1.5rem+1mm)]">
        <div className="mb-6 flex justify-center">
          <Image
            src="/images/Group 1000007086.svg"
            alt="Trade Ground"
            width={204}
            height={65}
            className="h-[52px] w-auto max-w-full object-contain object-center opacity-[0.98]"
            priority
            unoptimized
          />
        </div>

        <div className="mb-5 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#5a7349]/45 bg-[#3F5331]/35 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#D3F1A7]/90 backdrop-blur-sm">
            <Shield size={14} className="shrink-0 opacity-90" />
            {t('completeRegistration.badge')}
          </span>
        </div>

        <h1 className="mb-3 text-center text-2xl font-bold leading-tight text-white">
          {t('completeRegistration.title')}
        </h1>
        <p className="mb-8 text-center text-sm leading-relaxed text-white/65">
          {t('completeRegistration.intro')}
        </p>

        <div className="space-y-3 rounded-3xl border border-white/[0.1] bg-white/[0.04] p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)] backdrop-blur-md">
          <StepCard
            done={agreed}
            icon={FileText}
            text={t('completeRegistration.stepAgreement')}
            doneLabel={t('completeRegistration.stepDone')}
          />
          <StepCard
            done={hasContact}
            icon={Smartphone}
            text={t('completeRegistration.stepContact')}
            doneLabel={t('completeRegistration.stepDone')}
          />
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              openBot();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D3F1A7] py-3.5 text-sm font-semibold text-black transition-colors hover:bg-[#c5e895] active:bg-[#b8de88]"
          >
            <ExternalLink size={18} strokeWidth={2.2} />
            {t('completeRegistration.openBot')}
          </button>

          <Link
            href={`/${lang}/oferta`}
            onClick={() => tg?.HapticFeedback?.impactOccurred('light')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.06] py-3.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/[0.1] active:bg-white/[0.08]"
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
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-transparent py-3.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/25 hover:bg-white/[0.05] disabled:opacity-45"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <RefreshCw size={18} strokeWidth={2.2} />
            )}
            {loading ? t('common.loading') : t('completeRegistration.refresh')}
          </button>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-white/45">
          {t('completeRegistration.hint')}
        </p>
        <p className="mt-4 text-center text-xs text-white/35">{t('menu.support')}</p>
      </div>
    </div>
  );
}

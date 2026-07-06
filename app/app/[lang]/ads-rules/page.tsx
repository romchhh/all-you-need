'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Megaphone, Search } from 'lucide-react';
import { useTelegram } from '@/features/telegram/hooks/useTelegram';
import { AppHeader } from '@/components/layout/AppHeader';
import {
  OVERLAY_BACK_BUTTON_TOP_CLASS,
  overlayHeaderActionClass,
} from '@/components/layout/FixedLogoHeader';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useScrollToTopOnMount } from '@/features/ui/hooks/useScrollToTopOnMount';
import Image from 'next/image';

const BOT_LINK = 'https://t.me/TradeGroundBot?start=linktowatch_12';

export default function AdsRulesPage() {
  const router = useRouter();
  const { tg } = useTelegram();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  useScrollToTopOnMount();

  const goBack = () => {
    router.back();
    tg?.HapticFeedback.impactOccurred('light');
  };

  const openBot = () => {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(BOT_LINK);
      tg.HapticFeedback?.impactOccurred('medium');
    } else {
      window.location.href = BOT_LINK;
    }
  };

  const moderationSection = isLight
    ? {
        card: 'border-red-200/90 bg-red-50/90',
        badge: 'bg-red-100 border-red-300 text-red-800',
        image: 'border-red-200 bg-gray-50',
        body: 'text-red-950/85',
        note: 'text-red-900/70',
      }
    : {
        card: 'border-red-400/40 bg-red-500/10',
        badge: 'bg-red-500/20 border-red-400/60 text-red-100',
        image: 'border-red-400/60 bg-black/40',
        body: 'text-red-50/90',
        note: 'text-red-50/80',
      };

  const promotionSection = isLight
    ? {
        card: 'border-amber-200/90 bg-amber-50/90',
        badge: 'bg-amber-100 border-amber-300 text-amber-900',
        image: 'border-amber-200 bg-gray-50',
        body: 'text-amber-950/85',
        note: 'text-amber-900/70',
      }
    : {
        card: 'border-yellow-300/40 bg-yellow-500/10',
        badge: 'bg-yellow-500/20 border-yellow-300/60 text-yellow-100',
        image: 'border-yellow-300/60 bg-black/40',
        body: 'text-yellow-50/90',
        note: 'text-yellow-50/80',
      };

  const tagsSection = isLight
    ? {
        card: 'border-sky-200/90 bg-sky-50/90',
        badge: 'bg-sky-100 border-sky-300 text-sky-900',
        image: 'border-sky-200 bg-gray-50',
        body: 'text-sky-950/85',
        note: 'text-sky-900/70',
      }
    : {
        card: 'border-sky-400/40 bg-sky-500/10',
        badge: 'bg-sky-500/20 border-sky-400/60 text-sky-100',
        image: 'border-sky-400/60 bg-black/40',
        body: 'text-sky-50/90',
        note: 'text-sky-50/80',
      };

  const secondaryButton = isLight
    ? 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50'
    : 'bg-white/10 border border-white/30 text-white hover:bg-white/20';

  return (
    <div className="min-h-screen overflow-x-hidden pb-20" style={{ background: ac.pageBackground }}>
      <AppHeader />

      <button
        type="button"
        onClick={goBack}
        aria-label="Назад"
        className={`fixed left-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${OVERLAY_BACK_BUTTON_TOP_CLASS} ${overlayHeaderActionClass(isLight)}`}
      >
        <ArrowLeft size={20} />
      </button>

      <div className="mx-auto w-full max-w-2xl overflow-x-hidden">
        <div className="space-y-6 px-4 pb-6 pt-14">
          <h1 className={`text-2xl font-bold leading-tight ${ac.pageHeading}`}>
            Правила и продвижение
          </h1>

          <section className={`rounded-3xl border p-5 space-y-3 ${moderationSection.card}`}>
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${moderationSection.badge}`}
            >
              <ShieldCheck size={14} />
              <span>Правила размещения объявлений</span>
            </div>
            <div
              className={`relative h-40 w-full overflow-hidden rounded-2xl border sm:h-48 ${moderationSection.image}`}
            >
              <Image
                src="/images/pages/ads-rules-moderation.jpg"
                alt="Правила размещения объявлений TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className={`text-xl font-bold ${ac.pageHeading}`}>Модерация и качество объявлений</h2>
            <p className={`text-sm leading-relaxed ${moderationSection.body}`}>
              Все объявления проходят предварительную проверку на соответствие правилам платформы.
            </p>
            <p className={`text-sm leading-relaxed ${moderationSection.body}`}>Не допускаются объявления:</p>
            <ul className={`list-disc space-y-1 pl-5 text-sm ${moderationSection.body}`}>
              <li>с навязчивым или повторяющимся содержанием</li>
              <li>с недостоверной или вводящей в заблуждение информацией</li>
              <li>с контентом, нарушающим правила платформы</li>
              <li>с агрессивной или конфликтной подачей</li>
            </ul>
            <p className={`text-xs ${moderationSection.note}`}>
              📌 Если на объявление поступает жалоба, оно может быть дополнительно проверено.
            </p>
            <p className={`text-xs ${moderationSection.note}`}>
              📌 В отдельных случаях доступ к платформе может быть ограничен.
            </p>
          </section>

          <section className={`rounded-3xl border p-5 space-y-3 ${promotionSection.card}`}>
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${promotionSection.badge}`}
            >
              <Megaphone size={14} />
              <span>Продвижение и реклама</span>
            </div>
            <div
              className={`relative h-40 w-full overflow-hidden rounded-2xl border sm:h-48 ${promotionSection.image}`}
            >
              <Image
                src="/images/pages/ads-rules-promotion.jpg"
                alt="Продвижение и реклама TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className={`text-xl font-bold ${ac.pageHeading}`}>Как усилить своё объявление</h2>
            <p className={`text-sm leading-relaxed ${promotionSection.body}`}>
              Базовая публикация в канале сейчас — <span className="font-semibold">БЕСПЛАТНО</span>.
            </p>
            <p className={`text-sm leading-relaxed ${promotionSection.body}`}>
              Дополнительно доступны платные инструменты продвижения, которые увеличивают видимость и
              количество откликов:
            </p>
            <ul className={`list-disc space-y-1 pl-5 text-sm ${promotionSection.body}`}>
              <li>визуальное выделение</li>
              <li>закреп в канале</li>
              <li>сторис</li>
            </ul>
            <p className={`text-xs ${promotionSection.note}`}>
              📌 Комбинация форматов даёт максимальный охват и больше потенциальных клиентов.
            </p>
            <button
              type="button"
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3F5331] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#344728]"
            >
              Настроить продвижение в @TradeGroundBot
            </button>
          </section>

          <section className={`mb-4 rounded-3xl border p-5 space-y-3 ${tagsSection.card}`}>
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${tagsSection.badge}`}
            >
              <Search size={14} />
              <span>Поиск объявлений по тегам</span>
            </div>
            <div
              className={`relative h-40 w-full overflow-hidden rounded-2xl border sm:h-48 ${tagsSection.image}`}
            >
              <Image
                src="/images/pages/ads-rules-tags.jpg"
                alt="Поиск объявлений по тегам TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className={`text-xl font-bold ${ac.pageHeading}`}>Как быстро находить нужные объявления</h2>
            <p className={`text-sm leading-relaxed ${tagsSection.body}`}>
              Все объявления автоматически сортируются по тегам для удобного поиска.
            </p>
            <p className={`text-sm leading-relaxed ${tagsSection.body}`}>Основные типы тегов:</p>
            <ul className={`list-disc space-y-1 pl-5 text-sm ${tagsSection.body}`}>
              <li>
                <span className="font-semibold">По району и городу:</span> #Hamburg #Wedel #Altona
                #Harburg и др.
              </li>
              <li>
                <span className="font-semibold">По категориям:</span> #Услуги #Вакансия
                #Красотаиздоровье #Мероприятие и др.
              </li>
            </ul>
            <p className={`text-sm leading-relaxed ${tagsSection.body}`}>
              Как искать: нажмите на нужный тег под постом — откроются все объявления по теме.
            </p>
            <p className={`text-xs ${tagsSection.note}`}>
              Примеры: #Вакансия → все вакансии; #Wedel → все объявления по Веделю; нужный район →
              объявления рядом с вами.
            </p>
            <p className={`text-xs ${tagsSection.note}`}>
              📌 Можно нажимать любой тег под постами и быстро находить нужное.
            </p>
            <button
              type="button"
              onClick={openBot}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm transition-colors ${secondaryButton}`}
            >
              Подать объявление через @TradeGroundBot
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Megaphone, Search, Hash } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import Image from 'next/image';

const BOT_LINK = 'https://t.me/TradeGroundBot?start=linktowatch_12';

export default function AdsRulesPage() {
  const params = useParams();
  const router = useRouter();
  const { tg } = useTelegram();
  const lang = (params?.lang as string) || 'uk';

  const goBack = () => {
    router.back();
    tg?.HapticFeedback.impactOccurred('light');
  };

  const openBot = () => {
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink(BOT_LINK);
      tg.HapticFeedback?.impactOccurred('medium');
    } else {
      window.location.href = BOT_LINK;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#3F5331] to-[#111111] pb-20">
      <div className="max-w-2xl mx-auto text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold truncate">Правила и продвижение</h1>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-6">
          {/* Правила размещения */}
          <section className="rounded-3xl border border-red-400/40 bg-red-500/10 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-400/60 text-xs font-medium text-red-100">
              <ShieldCheck size={14} />
              <span>Правила размещения объявлений</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-red-400/60 bg-black/40">
              <Image
                src="/images/pages/IMAGE 2026-03-02 23:04:29.jpg"
                alt="Правила размещения объявлений TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Модерация и качество объявлений</h2>
            <p className="text-sm text-red-50/90 leading-relaxed">
              Все объявления проходят предварительную проверку на соответствие правилам платформы.
            </p>
            <p className="text-sm text-red-50/90 leading-relaxed">Не допускаются объявления:</p>
            <ul className="text-sm text-red-50/90 space-y-1 list-disc pl-5">
              <li>с навязчивым или повторяющимся содержанием</li>
              <li>с недостоверной или вводящей в заблуждение информацией</li>
              <li>с контентом, нарушающим правила платформы</li>
              <li>с агрессивной или конфликтной подачей</li>
            </ul>
            <p className="text-xs text-red-50/80">
              📌 Если на объявление поступает жалоба, оно может быть дополнительно проверено.
            </p>
            <p className="text-xs text-red-50/80">
              📌 В отдельных случаях доступ к платформе может быть ограничен.
            </p>
          </section>

          {/* Продвижение и реклама */}
          <section className="rounded-3xl border border-yellow-300/40 bg-yellow-500/10 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-300/60 text-xs font-medium text-yellow-100">
              <Megaphone size={14} />
              <span>Продвижение и реклама</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-yellow-300/60 bg-black/40">
              <Image
                src="/images/pages/IMAGE 2026-03-02 23:04:45.jpg"
                alt="Продвижение и реклама TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Как усилить своё объявление</h2>
            <p className="text-sm text-yellow-50/90 leading-relaxed">
              Базовая публикация в канале сейчас — <span className="font-semibold">БЕСПЛАТНО</span>.
            </p>
            <p className="text-sm text-yellow-50/90 leading-relaxed">
              Дополнительно доступны платные инструменты продвижения, которые увеличивают видимость и
              количество откликов:
            </p>
            <ul className="text-sm text-yellow-50/90 space-y-1 list-disc pl-5">
              <li>визуальное выделение</li>
              <li>закреп в канале</li>
              <li>сторис</li>
            </ul>
            <p className="text-xs text-yellow-50/80">
              📌 Комбинация форматов даёт максимальный охват и больше потенциальных клиентов.
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#D3F1A7] text-black font-semibold text-sm hover:bg-[#c7e480] transition-colors"
            >
              Настроить продвижение в @TradeGroundBot
            </button>
          </section>

          {/* Поиск по тегам */}
          <section className="rounded-3xl border border-sky-400/40 bg-sky-500/10 p-5 space-y-3 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/60 text-xs font-medium text-sky-100">
              <Search size={14} />
              <span>Поиск объявлений по тегам</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-sky-400/60 bg-black/40">
              <Image
                src="/images/pages/IMAGE 2026-03-02 23:04:57.jpg"
                alt="Поиск объявлений по тегам TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Как быстро находить нужные объявления</h2>
            <p className="text-sm text-sky-50/90 leading-relaxed">
              Все объявления автоматически сортируются по тегам для удобного поиска.
            </p>
            <p className="text-sm text-sky-50/90 leading-relaxed">Основные типы тегов:</p>
            <ul className="text-sm text-sky-50/90 space-y-1 list-disc pl-5">
              <li>
                <span className="font-semibold">По району и городу:</span> #Hamburg #Wedel #Altona
                #Harburg и др.
              </li>
              <li>
                <span className="font-semibold">По категориям:</span> #Услуги #Вакансия
                #Красотаиздоровье #Мероприятие и др.
              </li>
            </ul>
            <p className="text-sm text-sky-50/90 leading-relaxed">
              Как искать: нажмите на нужный тег под постом — откроются все объявления по теме.
            </p>
            <p className="text-xs text-sky-50/80">
              Примеры: #Вакансия → все вакансии; #Wedel → все объявления по Веделю; нужный район →
              объявления рядом с вами.
            </p>
            <p className="text-xs text-sky-50/80">
              📌 Можно нажимать любой тег под постами и быстро находить нужное.
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/30 text-sm hover:bg-white/20 transition-colors"
            >
              Подать объявление через @TradeGroundBot
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}


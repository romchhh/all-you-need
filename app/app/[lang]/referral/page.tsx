'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Gift, Users, Wallet } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import Image from 'next/image';

const BOT_LINK = 'https://t.me/TradeGroundBot?start=linktowatch_12';

export default function ReferralPage() {
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
    <div className="min-h-screen bg-gradient-to-br from-[#111111] via-[#3F5331] to-black pb-20">
      <div className="max-w-2xl mx-auto text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold truncate">Реферальная программа TradeGround</h1>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-6">
          <section className="rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/60 text-xs font-medium text-emerald-100">
              <Gift size={14} />
              <span>Бонусы за друзей</span>
            </div>
            <div className="relative w-full h-52 sm:h-60 rounded-2xl overflow-hidden border border-emerald-300/60 bg-black/40">
              <video
                src="/images/pages/IMG_2420.MP4"
                className="w-full h-full object-cover"
                controls
                playsInline
                preload="metadata"
              />
            </div>
            <h2 className="text-xl font-bold">Приглашайте друзей — получайте награды</h2>
            <p className="text-sm text-emerald-50/90 leading-relaxed">
              Реферальная программа TradeGround позволяет получать бонусы за активность приглашённых
              пользователей на платформе.
            </p>
            <h3 className="text-sm font-semibold mt-2">Как это работает?</h3>
            <ol className="text-sm text-emerald-50/90 space-y-2 list-decimal pl-5">
              <li>Перейдите в раздел «Реферальная программа» в боте</li>
              <li>Поделитесь своей реферальной ссылкой</li>
              <li>Друг регистрируется по вашей ссылке</li>
              <li>
                После подачи им первого объявления (в канале или маркетплейсе) вы получаете{' '}
                <span className="font-semibold">1 €</span> на баланс.
              </li>
            </ol>
            <p className="text-xs text-emerald-50/80">
              💳 Бонус зачисляется на общий баланс и может быть использован для подачи и рекламы
              объявлений в канале и маркетплейсе.
            </p>
            <button
              onClick={openBot}
              className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#D3F1A7] text-black font-semibold text-sm hover:bg-[#c7e480] transition-colors"
            >
              Открыть реферальный раздел в @TradeGroundBot
            </button>
          </section>

          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/30 text-xs font-medium text-white/80">
              <Wallet size={14} />
              <span>Бонусный баланс</span>
            </div>
            <h2 className="text-lg font-semibold">Куда можно потратить бонусы?</h2>
            <ul className="text-sm text-white/80 space-y-2 list-disc pl-5">
              <li>на подачу и рекламу объявлений в канале</li>
              <li>на размещение и продвижение в маркетплейсе</li>
            </ul>
            <p className="text-xs text-white/70">
              📌 Все бонусы попадают на ваш общий баланс, который используется для любых платных
              действий на платформе.
            </p>
          </section>

          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-3 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/30 text-xs font-medium text-white/80">
              <Users size={14} />
              <span>Статистика и прозрачность</span>
            </div>
            <h2 className="text-lg font-semibold">Всё под контролем</h2>
            <p className="text-sm text-white/80 leading-relaxed">
              В разделе «Реферальная программа» вы всегда видите:
            </p>
            <ul className="text-sm text-white/80 space-y-2 list-disc pl-5">
              <li>количество приглашённых пользователей</li>
              <li>полученные награды</li>
              <li>общую сумму бонусов</li>
            </ul>
            <p className="text-xs text-white/70">
              📌 Реферальная система одинаково работает и для канала, и для маркетплейса.
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/30 text-sm hover:bg-white/20 transition-colors"
            >
              Запустить реферальную программу
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}


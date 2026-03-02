'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Layers, Send, UserCircle2 } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import Image from 'next/image';

const BOT_LINK = 'https://t.me/TradeGroundBot?start=linktowatch_12';

export default function PlatformPage() {
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
    <div className="min-h-screen bg-gradient-to-br from-[#3F5331] via-[#111111] to-black pb-20">
      <div className="max-w-2xl mx-auto text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-semibold truncate">
            TradeGround · Платформа объявлений
          </h1>
        </div>

        <div className="px-4 pt-4 pb-6 space-y-6">
          {/* Блок: Добро пожаловать в TradeGround | Гамбург */}
          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/40 text-xs font-medium text-emerald-200">
              <MapPin size={14} />
              <span>TradeGround · Гамбург 🇩🇪</span>
            </div>
            <div className="relative w-full h-40 sm:h-52 rounded-2xl overflow-hidden border border-emerald-500/30 bg-black/40">
              <Image
                src="/images/pages/about-tradeground.jpg"
                alt="TradeGround · Гамбург"
                fill
                priority
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Экосистема объявлений в Telegram</h2>
            <p className="text-sm text-white/80 leading-relaxed">
              TradeGround — экосистема объявлений и торговли в Telegram для русско- и
              украиноязычных жителей Германии.
            </p>
            <p className="text-sm text-white/80 leading-relaxed">
              Этот канал — городская доска объявлений. Здесь публикуются локальные объявления
              по Гамбургу и окрестностям:
            </p>
            <ul className="text-sm text-white/80 space-y-1 list-disc pl-5">
              <li>услуги и специалисты</li>
              <li>вакансии и поиск персонала</li>
              <li>доставка и перевозки</li>
              <li>недвижимость и автосервисы</li>
              <li>реклама бизнеса</li>
            </ul>
            <p className="text-sm text-white/80 leading-relaxed">
              Экосистема состоит из трёх элементов:
            </p>
            <ul className="text-sm text-white/80 space-y-1 list-disc pl-5">
              <li>Telegram-канал — витрина локальных объявлений по городу</li>
              <li>Telegram-бот — подача и управление объявлениями</li>
              <li>Маркетплейс — отдельная площадка для продажи товаров и размещения предложений</li>
            </ul>
            <p className="text-xs text-white/60">
              📌 Продажа товаров осуществляется через маркетплейс TradeGround, а не в этом канале.
            </p>
            <button
              onClick={openBot}
              className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#D3F1A7] text-black font-semibold text-sm hover:bg-[#c7e480] transition-colors"
            >
              Перейти в @TradeGroundBot
            </button>
          </section>

          {/* Блок: Канал vs Маркетплейс */}
          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/40 text-xs font-medium text-sky-200">
              <Layers size={14} />
              <span>Канал vs Маркетплейс</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-sky-400/40 bg-black/40">
              <Image
                src="/images/pages/platform-channel-vs-marketplace.jpg"
                alt="Канал и маркетплейс TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">В чём разница?</h2>
            <p className="text-sm text-white/80 leading-relaxed">
              В TradeGround есть два формата размещения, и они решают разные задачи:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-black/40 border border-white/10 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white/90">КАНАЛ</h3>
                <ul className="text-xs text-white/75 space-y-1 list-disc pl-4">
                  <li>услуги и специалисты</li>
                  <li>вакансии и поиск персонала</li>
                  <li>реклама бизнеса</li>
                  <li>локальный отклик по городу</li>
                </ul>
              </div>
              <div className="rounded-2xl bg-black/40 border border-white/10 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white/90">МАРКЕТПЛЕЙС</h3>
                <ul className="text-xs text-white/75 space-y-1 list-disc pl-4">
                  <li>продажа товаров</li>
                  <li>каталог с категориями</li>
                  <li>поиск и размещение без привязки к ленте</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-white/70">
              📌 Объявления не дублируются автоматически — вы сами выбираете формат или
              комбинируете оба для лучшего результата.
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/30 text-sm hover:bg-white/20 transition-colors"
            >
              Подать объявление в @TradeGroundBot
            </button>
          </section>

          {/* Блок: Как подать объявление */}
          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/40 text-xs font-medium text-indigo-200">
              <Send size={14} />
              <span>Как подать объявление</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-indigo-400/40 bg-black/40">
              <Image
                src="/images/pages/platform-how-to-post.jpg"
                alt="Как подать объявление в TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Пошаговая подача объявления</h2>
            <ol className="text-sm text-white/80 space-y-2 list-decimal pl-5">
              <li>Перейдите в @TradeGroundBot</li>
              <li>
                Выберите, куда вы хотите разместить объявление:
                <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                  <li>в канал — подача через меню в боте</li>
                  <li>в маркетплейс — переход через кнопку «Marketplace» в боте</li>
                </ul>
              </li>
              <li>Заполните объявление по нужной категории</li>
              <li>Опубликуйте и управляйте всеми объявлениями в одном месте</li>
            </ol>
            <p className="text-xs text-white/70">
              📌 Размещение и продвижение доступны внутри платформы. Сейчас подача объявлений —{' '}
              <span className="font-semibold text-emerald-300">БЕСПЛАТНО</span>.
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#D3F1A7] text-black font-semibold text-sm hover:bg-[#c7e480] transition-colors"
            >
              Начать в @TradeGroundBot
            </button>
          </section>

          {/* Блок: Профиль в системе TradeGround */}
          <section className="rounded-3xl border border-white/15 bg-white/5 p-5 space-y-3 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-400/40 text-xs font-medium text-purple-200">
              <UserCircle2 size={14} />
              <span>Профиль пользователя</span>
            </div>
            <div className="relative w-full h-40 sm:h-48 rounded-2xl overflow-hidden border border-purple-400/40 bg-black/40">
              <Image
                src="/images/pages/platform-profile.jpg"
                alt="Профиль пользователя TradeGround"
                fill
                className="object-contain"
              />
            </div>
            <h2 className="text-xl font-bold">Единый профиль в системе TradeGround</h2>
            <ul className="text-sm text-white/80 space-y-2 list-disc pl-5">
              <li>
                Единый профиль для канала и маркетплейса
                <br />
                <span className="text-xs text-white/70">
                  (открывается через меню бота и отображается в интерфейсе маркетплейса)
                </span>
              </li>
              <li>
                Общий баланс для всех услуг платформы
                <br />
                <span className="text-xs text-white/70">
                  (можно использовать для подачи и рекламы объявлений в канале и маркетплейсе)
                </span>
              </li>
              <li>
                Настройки профиля
                <br />
                <span className="text-xs text-white/70">
                  (язык интерфейса, имя и контактные данные)
                </span>
              </li>
            </ul>
            <p className="text-xs text-white/70">
              📌 Объявления и история публикаций в канале доступны в боте в разделе «Мои объявления».
            </p>
            <button
              onClick={openBot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/30 text-sm hover:bg-white/20 transition-colors"
            >
              Открыть профиль в @TradeGroundBot
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}


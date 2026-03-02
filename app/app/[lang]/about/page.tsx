'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import Image from 'next/image';

export default function AboutPage() {
  const params = useParams();
  const router = useRouter();
  const { tg } = useTelegram();
  const lang = (params?.lang as string) === 'ru' ? 'ru' : 'uk';

  const content =
    lang === 'ru'
      ? {
          title: 'О проекте Trade Ground',
          subtitle: 'Современный маркетплейс в формате Telegram Mini App',
          p1: 'Trade Ground Marketplace — это удобная площадка для покупки и продажи товаров прямо в Telegram. Мы совмещаем простой интерфейс, безопасность и современные технологии.',
          p2: 'Проект создан командой, которая ежедневно пользуется маркетплейсами и хорошо понимает, чего им не хватает: скорости, доверия и удобства на мобильных устройствах.',
          sections: [
            {
              title: 'Почему мы создали Trade Ground?',
              text: 'Мы хотели сделать маркетплейс, который работает естественно в Telegram: без сложной регистрации, с быстрым доступом к продавцу и удобной мобильной версией.',
            },
            {
              title: 'Что отличает нас от классических досок объявлений?',
              text: 'Фокус на мобильном UX, простые инструменты продвижения объявлений, честная модерация и быстрый старт для продавцов и малого бизнеса.',
            },
            {
              title: 'Для кого эта платформа?',
              text: 'Для частных продавцов, реселлеров, малого бизнеса и всех, кто хочет быстро протестировать спрос на свои товары без сложных витрин и интернет-магазинов.',
            },
          ],
        }
      : {
          title: 'Про Trade Ground',
          subtitle: 'Сучасний маркетплейс у форматі Telegram Mini App',
          p1: 'Trade Ground Marketplace — це зручний майданчик для купівлі та продажу товарів прямо в Telegram. Ми поєднуємо простий інтерфейс, безпеку та сучасні технології.',
          p2: 'Проєкт створений командою, яка щодня користується маркетплейсами і добре розуміє, чого їм бракує: швидкості, довіри та зручності на мобільних пристроях.',
          sections: [
            {
              title: 'Навіщо ми створили Trade Ground?',
              text: 'Ми хотіли зробити маркетплейс, який природно працює всередині Telegram: без складної реєстрації, з швидким доступом до продавця та зручним мобільним інтерфейсом.',
            },
            {
              title: 'Чим ми відрізняємось від класичних дошок оголошень?',
              text: 'Фокус на мобільному UX, прості інструменти просування оголошень, чесна модерація та швидкий старт для продавців і малого бізнесу.',
            },
            {
              title: 'Для кого ця платформа?',
              text: 'Для приватних продавців, реселерів, малого бізнесу та всіх, хто хоче швидко протестувати попит на свої товари без складних інтернет-магазинів.',
            },
          ],
        };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-2xl mx-auto bg-white min-h-screen">
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center gap-3 z-10">
          <button
            onClick={() => {
              router.back();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{content.title}</h1>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm uppercase tracking-wide text-green-700 font-semibold">
            Trade Ground Marketplace
          </p>
          <h2 className="text-2xl font-bold text-gray-900">{content.subtitle}</h2>
          <div className="relative w-full h-40 sm:h-52 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100">
            <Image
              src="/images/pages/IMAGE 2026-03-02 23:02:23.jpg"
              alt="TradeGround Marketplace"
              fill
              className="object-contain"
            />
          </div>
          <p className="text-gray-700 leading-relaxed">{content.p1}</p>
          <p className="text-gray-700 leading-relaxed">{content.p2}</p>

          <div className="space-y-6 mt-4">
            {content.sections.map((section) => (
              <section
                key={section.title}
                className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{section.title}</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{section.text}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


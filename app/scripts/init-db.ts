/**
 * Скрипт для ініціалізації бази даних
 * Запускати: npx tsx scripts/init-db.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing database...');

  // Створюємо категорії згідно ТЗ
  const categoriesData = [
    {
      name: 'Електроніка та техніка',
      icon: '📱',
      sortOrder: 1,
      children: [
        { name: 'Смартфони', sortOrder: 1 },
        { name: 'Ноутбуки / ПК', sortOrder: 2 },
        { name: 'Телевізори', sortOrder: 3 },
        { name: 'Аудіо / Навушники', sortOrder: 4 },
        { name: 'Ігрові приставки', sortOrder: 5 },
        { name: 'Побутова техніка', sortOrder: 6 },
        { name: 'Інше', sortOrder: 7 },
      ],
    },
    {
      name: 'Авто та транспорт',
      icon: '🚗',
      sortOrder: 2,
      children: [
        { name: 'Легкові авто', sortOrder: 1 },
        { name: 'Мотоцикли / Скутери', sortOrder: 2 },
        { name: 'Автозапчастини', sortOrder: 3 },
        { name: 'Шини / Диски', sortOrder: 4 },
        { name: 'Аксесуари', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Нерухомість',
      icon: '🏠',
      sortOrder: 3,
      children: [
        { name: 'Квартири (оренда)', sortOrder: 1 },
        { name: 'Квартири (продаж)', sortOrder: 2 },
        { name: 'Кімнати', sortOrder: 3 },
        { name: 'Будинки', sortOrder: 4 },
        { name: 'Комерційна нерухомість', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Дім і сад',
      icon: '🛋️',
      sortOrder: 4,
      children: [
        { name: 'Меблі', sortOrder: 1 },
        { name: 'Інтер\'єр', sortOrder: 2 },
        { name: 'Інструменти', sortOrder: 3 },
        { name: 'Садова техніка', sortOrder: 4 },
        { name: 'Освітлення', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Одяг, взуття, аксесуари',
      icon: '👕',
      sortOrder: 5,
      children: [
        { name: 'Жіночий одяг', sortOrder: 1 },
        { name: 'Чоловічий одяг', sortOrder: 2 },
        { name: 'Дитячий одяг', sortOrder: 3 },
        { name: 'Взуття', sortOrder: 4 },
        { name: 'Сумки / Аксесуари', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Дитячі товари',
      icon: '🧸',
      sortOrder: 6,
      children: [
        { name: 'Одяг', sortOrder: 1 },
        { name: 'Іграшки', sortOrder: 2 },
        { name: 'Коляски', sortOrder: 3 },
        { name: 'Автокрісла', sortOrder: 4 },
        { name: 'Шкільні товари', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Хобі та спорт',
      icon: '⚽',
      sortOrder: 7,
      children: [
        { name: 'Велосипеди', sortOrder: 1 },
        { name: 'Фітнес', sortOrder: 2 },
        { name: 'Туризм', sortOrder: 3 },
        { name: 'Музичні інструменти', sortOrder: 4 },
        { name: 'Колекціонування', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Бізнес та обладнання',
      icon: '💼',
      sortOrder: 8,
      children: [
        { name: 'Обладнання', sortOrder: 1 },
        { name: 'Інструменти', sortOrder: 2 },
        { name: 'Торгівля', sortOrder: 3 },
        { name: 'Послуги для бізнесу', sortOrder: 4 },
        { name: 'Інше', sortOrder: 5 },
      ],
    },
    {
      name: 'Послуги',
      icon: '🔧',
      sortOrder: 9,
      children: [
        { name: 'Ремонт', sortOrder: 1 },
        { name: 'Краса', sortOrder: 2 },
        { name: 'Перевезення', sortOrder: 3 },
        { name: 'Допомога по дому', sortOrder: 4 },
        { name: 'IT / Дизайн', sortOrder: 5 },
        { name: 'Інше', sortOrder: 6 },
      ],
    },
    {
      name: 'Віддам безкоштовно',
      icon: '🎁',
      sortOrder: 10,
    },
  ];

  for (const categoryData of categoriesData) {
    const category = await prisma.category.upsert({
      where: { name: categoryData.name },
      update: {},
      create: {
        name: categoryData.name,
        icon: categoryData.icon,
        sortOrder: categoryData.sortOrder,
        children: categoryData.children
          ? {
              create: categoryData.children.map((child) => ({
                name: child.name,
                icon: '',
                sortOrder: child.sortOrder,
              })),
            }
          : undefined,
      },
    });

    console.log(`Created category: ${category.name}`);
  }

  console.log('Database initialized successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


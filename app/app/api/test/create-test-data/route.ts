import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Сирі запити, щоб уникнути помилки Prisma з DateTime (createdAt може бути timestamp у БД)
type UserRow = { id: number; firstName: string | null; lastName: string | null; avatar: string | null };

const TEST_TELEGRAM_ID = 999999999;
const AVATAR_URL = 'https://i.pravatar.cc/400';

// Справжні фото товарів (Unsplash, стабільні URL)
const TEST_LISTINGS = [
  {
    title: 'Смартфон Samsung Galaxy',
    description: 'Відмінний стан, повна комплектація. Продаю через оновлення.',
    price: '850',
    currency: 'EUR',
    category: 'electronics',
    subcategory: 'smartphones',
    condition: 'like_new',
    location: 'Київ',
    images: [
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800',
      'https://images.unsplash.com/photo-1592286927505-d3d0c2e3a9e5?w=800',
    ],
  },
  {
    title: 'Диван угловий',
    description: 'М\'який диван, колір сірий. Самовивіз.',
    price: '450',
    currency: 'EUR',
    category: 'furniture',
    subcategory: 'sofas_chairs',
    condition: 'good',
    location: 'Львів',
    images: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800',
      'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=800',
    ],
  },
  {
    title: 'Кросівки Nike 44',
    description: 'Нові, не підійшли за розміром.',
    price: '220',
    currency: 'EUR',
    category: 'fashion',
    subcategory: 'men_shoes',
    condition: 'new',
    location: 'Одеса',
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800',
    ],
  },
  {
    title: 'Ноутбук MacBook Air M1',
    description: '256 ГБ, батарея тримає. Без подряпин.',
    price: '320',
    currency: 'EUR',
    category: 'electronics',
    subcategory: 'computers_laptops',
    condition: 'like_new',
    location: 'Харків',
    images: [
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800',
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800',
    ],
  },
  {
    title: 'Дитяча коляска',
    description: 'Трансформер 3 в 1. Відмінний стан.',
    price: '300',
    currency: 'EUR',
    category: 'kids',
    subcategory: 'strollers_car_seats',
    condition: 'good',
    location: 'Дніпро',
    images: [
      'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800',
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800',
    ],
  },
  {
    title: 'Велосипед горний',
    description: 'Розмір рами 18. Підходить для підлітка або жінки.',
    price: '70',
    currency: 'EUR',
    category: 'hobby_sports',
    subcategory: 'bikes_scooters',
    condition: 'good',
    location: 'Київ',
    images: [
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800',
      'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=800',
    ],
  },
  {
    title: 'Холодильник Samsung',
    description: 'Двокамерний, No Frost. Робочий.',
    price: '100',
    currency: 'EUR',
    category: 'appliances',
    subcategory: 'large_appliances',
    condition: 'good',
    location: 'Запоріжжя',
    images: [
      'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800',
      'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800',
    ],
  },
  {
    title: 'Куртка зимова жіноча',
    description: 'Розмір 42-44. Нова з биркою.',
    price: '280',
    currency: 'EUR',
    category: 'fashion',
    subcategory: 'women_clothing',
    condition: 'new',
    location: 'Вінниця',
    images: [
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
      'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800',
    ],
  },
  {
    title: 'Гітара акустична',
    description: 'Yamaha, для початківців. З чохлом.',
    price: '350',
    currency: 'EUR',
    category: 'hobby_sports',
    subcategory: 'music_instruments',
    condition: 'like_new',
    location: 'Львів',
    images: [
      'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800',
      'https://images.unsplash.com/photo-1525203692234-8f2935b6c8b8?w=800',
    ],
  },
  {
    title: 'Набір посуду 24 предмети',
    description: 'Нержавійка, для кухні. Не користувалась.',
    price: '150',
    currency: 'EUR',
    category: 'home',
    subcategory: 'dishes',
    condition: 'new',
    location: 'Київ',
    images: [
      'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
    ],
  },
];

function isAllowed(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const secret = request.nextUrl.searchParams.get('secret');
  return secret === process.env.CREATE_TEST_SECRET;
}

async function downloadAvatar(): Promise<string> {
  const res = await fetch(AVATAR_URL);
  if (!res.ok) throw new Error('Failed to fetch avatar');
  const buffer = Buffer.from(await res.arrayBuffer());
  const uploadsDir = join(process.cwd(), 'public', 'avatars');
  if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });
  const filename = `avatar_${TEST_TELEGRAM_ID}.jpg`;
  const filepath = join(uploadsDir, filename);
  await writeFile(filepath, buffer);
  return `/avatars/${filename}`;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isAllowed(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const avatarPath = await downloadAvatar();
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const existingRows = await prisma.$queryRawUnsafe<UserRow[]>(
      'SELECT id, firstName, lastName, avatar FROM User WHERE CAST(telegramId AS INTEGER) = ?',
      TEST_TELEGRAM_ID
    );
    const existing = existingRows[0];

    let userId: number;
    if (existing) {
      userId = existing.id;
      await prisma.$executeRawUnsafe(
        `UPDATE User SET firstName = ?, lastName = ?, avatar = ?, username = ?, updatedAt = ? WHERE id = ?`,
        'Тест',
        'Користувач',
        avatarPath,
        'test_user_fake',
        now,
        userId
      );
      await prisma.$executeRawUnsafe('DELETE FROM Listing WHERE userId = ?', userId);
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO User (telegramId, username, firstName, lastName, avatar, balance, rating, reviewsCount, isActive, listingPackagesBalance, hasUsedFreeAd, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 0, 5.0, 0, 1, 10, 0, ?, ?)`,
        TEST_TELEGRAM_ID,
        'test_user_fake',
        'Тест',
        'Користувач',
        avatarPath,
        now,
        now
      );
      const inserted = await prisma.$queryRawUnsafe<{ id: number }[]>(
        'SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ?',
        TEST_TELEGRAM_ID
      );
      userId = inserted[0].id;
    }

    for (const item of TEST_LISTINGS) {
      const views = Math.floor(Math.random() * 50);
      await prisma.$executeRawUnsafe(
        `INSERT INTO Listing (userId, title, description, price, currency, isFree, category, subcategory, condition, location, images, status, moderationStatus, views, publishedAt, moderatedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', 'approved', ?, ?, ?, ?, ?)`,
        userId,
        item.title,
        item.description,
        item.price,
        item.currency,
        item.category,
        item.subcategory,
        item.condition,
        item.location,
        JSON.stringify(item.images),
        views,
        now,
        now,
        now,
        now
      );
    }

    const listings = await prisma.$queryRawUnsafe<{ id: number; title: string; status: string }[]>(
      'SELECT id, title, status FROM Listing WHERE userId = ?',
      userId
    );

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        telegramId: String(TEST_TELEGRAM_ID),
        firstName: 'Тест',
        lastName: 'Користувач',
        avatar: avatarPath,
      },
      listingsCount: listings.length,
      listings: listings.map((l) => ({ id: l.id, title: l.title, status: l.status })),
    });
  } catch (e) {
    console.error('[create-test-data]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

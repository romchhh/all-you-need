import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import sharp from 'sharp';

// Генерація аватара з ініціалами
function generateAvatarInitials(firstName: string | null, lastName: string | null, username: string | null): string {
  let initials = '';
  if (firstName) {
    initials += firstName[0].toUpperCase();
  }
  if (lastName) {
    initials += lastName[0].toUpperCase();
  }
  if (!initials && username) {
    initials = username[0].toUpperCase();
  }
  if (!initials) {
    initials = 'U';
  }
  return initials;
}

// Генерація кольору на основі імені
function generateColorFromName(name: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52BE80'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Створення SVG аватара
function createAvatarSVG(initials: string, color: string): string {
  return `
    <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="${color}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="80" font-weight="bold" 
            fill="white" text-anchor="middle" dominant-baseline="central">
        ${initials}
      </text>
    </svg>
  `.trim();
}

// Завантаження фото профілю з Telegram
async function downloadProfilePhoto(photoUrl: string, userId: number): Promise<string | null> {
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      console.error('Failed to download photo:', response.status);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Конвертуємо в WebP з оптимізацією
    const optimizedBuffer = await sharp(buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85, effort: 4 })
      .toBuffer();
    
    const uploadsDir = join(process.cwd(), 'public', 'avatars');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    
    const filename = `avatar_${userId}_${Date.now()}.webp`;
    const filepath = join(uploadsDir, filename);
    
    await writeFile(filepath, optimizedBuffer);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error('Error downloading/optimizing photo:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('POST /api/user/profile - received data:', body);
    
    const { 
      telegramId, 
      username, 
      firstName, 
      lastName, 
      photoUrl 
    } = body;

    if (!telegramId) {
      console.error('telegramId is missing');
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    // Конвертуємо telegramId в число
    const telegramIdNum = parseInt(telegramId);
    console.log('Looking for user with telegramId:', telegramIdNum);

    // Перевіряємо чи користувач існує через raw query
    const existingUsers = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM User WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
    `;
    
    const existingUser = existingUsers[0];
    let user: any = null;
    
    if (existingUser) {
      // Отримуємо повні дані користувача
      const fullUsers = await prisma.$queryRaw<Array<{
        id: number;
        telegramId: number;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        avatar: string | null;
        balance: number;
        rating: number;
        reviewsCount: number;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
      }>>`
        SELECT 
          id,
          CAST(telegramId AS INTEGER) as telegramId,
          username,
          firstName,
          lastName,
          avatar,
          balance,
          rating,
          reviewsCount,
          isActive,
          createdAt,
          updatedAt
        FROM User
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
      user = fullUsers[0];
    }

    console.log('Found user:', user);

    let avatarPath: string | null = null;

    // Завантажуємо фото профілю якщо є
    if (photoUrl) {
      console.log('Downloading photo from URL:', photoUrl);
      avatarPath = await downloadProfilePhoto(photoUrl, Number(telegramId));
      console.log('Photo download result:', avatarPath);
    } else {
      console.log('No photoUrl provided');
    }

    // Якщо фото немає, створюємо аватар з ініціалами
    if (!avatarPath) {
      console.log('Generating avatar with initials');
      const initials = generateAvatarInitials(firstName, lastName, username);
      const color = generateColorFromName(firstName || username || 'User');
      const svg = createAvatarSVG(initials, color);
      
      const uploadsDir = join(process.cwd(), 'public', 'avatars');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }
      
      const filename = `avatar_${telegramId}_${Date.now()}.svg`;
      const filepath = join(uploadsDir, filename);
      
      await writeFile(filepath, svg);
      avatarPath = `/avatars/${filename}`;
      console.log('Generated avatar saved to:', avatarPath);
    }

    if (user) {
      // Оновлюємо існуючого користувача через raw query
      console.log('Updating existing user');
      
      const updateUsername = username !== undefined ? username : user.username;
      const updateFirstName = firstName !== undefined ? firstName : user.firstName;
      const updateLastName = lastName !== undefined ? lastName : user.lastName;
      const updateAvatar = avatarPath || user.avatar;
      const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      await prisma.$executeRaw`
        UPDATE User 
        SET 
          username = ${updateUsername},
          firstName = ${updateFirstName},
          lastName = ${updateLastName},
          avatar = ${updateAvatar},
          updatedAt = ${updateTime}
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
      
      // Отримуємо оновлені дані
      const updatedUsers = await prisma.$queryRaw<Array<{
        id: number;
        telegramId: number;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        avatar: string | null;
        balance: number;
        rating: number;
        reviewsCount: number;
        createdAt: string;
      }>>`
        SELECT 
          id,
          CAST(telegramId AS INTEGER) as telegramId,
          username,
          firstName,
          lastName,
          avatar,
          balance,
          rating,
          reviewsCount,
          createdAt
        FROM User
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
      
      user = updatedUsers[0];
      console.log('User updated:', user);
    } else {
      // Створюємо нового користувача через raw query
      console.log('Creating new user');
      const createTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      await prisma.$executeRaw`
        INSERT INTO User (
          telegramId, username, firstName, lastName, avatar, 
          balance, rating, reviewsCount, isActive, createdAt, updatedAt
        )
        VALUES (
          ${telegramIdNum},
          ${username || null},
          ${firstName || null},
          ${lastName || null},
          ${avatarPath || null},
          0.0,
          5.0,
          0,
          1,
          ${createTime},
          ${createTime}
        )
      `;
      
      // Отримуємо створені дані
      const createdUsers = await prisma.$queryRaw<Array<{
        id: number;
        telegramId: number;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        avatar: string | null;
        balance: number;
        rating: number;
        reviewsCount: number;
        createdAt: string;
      }>>`
        SELECT 
          id,
          CAST(telegramId AS INTEGER) as telegramId,
          username,
          firstName,
          lastName,
          avatar,
          balance,
          rating,
          reviewsCount,
          createdAt
        FROM User
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
      
      user = createdUsers[0];
      console.log('User created:', user);
    }

            const response = {
              id: user.id,
              telegramId: user.telegramId.toString(),
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar,
              balance: user.balance,
              rating: user.rating,
              reviewsCount: user.reviewsCount,
              createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
            };
    
    console.log('Returning response:', response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error creating/updating user profile:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to create/update user profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegramId');

    console.log('GET /api/user/profile - telegramId:', telegramId);

    if (!telegramId) {
      console.error('telegramId is missing in GET request');
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    // Конвертуємо telegramId в число (SQLite INTEGER підтримує великі числа)
    const telegramIdNum = parseInt(telegramId);
    console.log('GET /api/user/profile - searching for telegramId:', telegramId, 'as number:', telegramIdNum);

    // Використовуємо raw query для обходу проблеми з форматом дат в SQLite
    // Використовуємо Prisma.$queryRawUnsafe для правильної роботи з параметрами
    const users = await prisma.$queryRawUnsafe(
      `SELECT 
        id,
        CAST(telegramId AS INTEGER) as telegramId,
        username,
        firstName,
        lastName,
        phone,
        avatar,
        balance,
        rating,
        reviewsCount,
        createdAt
      FROM User
      WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{
      id: number;
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      avatar: string | null;
      balance: number;
      rating: number;
      reviewsCount: number;
      createdAt: string;
    }>;
    
    console.log('GET /api/user/profile - query returned', users.length, 'users');
    console.log('GET /api/user/profile - first user:', users[0]);
    const userData = users[0];

    console.log('GET /api/user/profile - found user:', userData);
    console.log('GET /api/user/profile - user avatar:', userData?.avatar);

    if (!userData) {
      console.log('User not found for telegramId:', telegramId);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const response = {
      id: userData.id,
      telegramId: userData.telegramId.toString(),
      username: userData.username,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone,
      avatar: userData.avatar,
      balance: userData.balance,
      rating: userData.rating,
      reviewsCount: userData.reviewsCount,
      createdAt: userData.createdAt,
    };
    
    console.log('GET /api/user/profile - returning:', response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to fetch user profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

async function handleRequest(request: NextRequest) {
  try {
    const formData = await request.formData();
    const telegramId = formData.get('telegramId') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const avatarFile = formData.get('avatar') as File | null;

    if (!telegramId) {
      return NextResponse.json(
        { error: 'telegramId is required' },
        { status: 400 }
      );
    }

    const telegramIdNum = parseInt(telegramId);
    let avatarPath: string | null = null;

    // Завантажуємо нове фото якщо є - просто замінюємо без обробки
    if (avatarFile && avatarFile.size > 0) {
      // Перевіряємо розмір файлу (максимум 5 МБ)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
      if (avatarFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File size exceeds 5MB limit' },
          { status: 400 }
        );
      }

      const uploadsDir = join(process.cwd(), 'public', 'avatars');
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      // Визначаємо розширення файлу
      const originalName = avatarFile.name;
      const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      const finalExtension = validExtensions.includes(extension) ? extension : 'jpg';
      
      // Стабільне ім'я файлу
      const filename = `avatar_${telegramId}.${finalExtension}`;
      const filepath = join(uploadsDir, filename);
      
      // Просто зберігаємо файл без обробки
      const bytes = await avatarFile.arrayBuffer();
      await writeFile(filepath, Buffer.from(bytes));
      
      avatarPath = `/avatars/${filename}`;
    }

    // Оновлюємо профіль
    const updateData: any = {
      firstName: firstName || null,
      lastName: lastName || null,
    };

    if (avatarPath) {
      updateData.avatar = avatarPath;
    }

    const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    if (avatarPath) {
      await prisma.$executeRaw`
        UPDATE User 
        SET 
          firstName = ${updateData.firstName},
          lastName = ${updateData.lastName},
          avatar = ${avatarPath},
          updatedAt = ${updateTime}
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE User 
        SET 
          firstName = ${updateData.firstName},
          lastName = ${updateData.lastName},
          updatedAt = ${updateTime}
        WHERE CAST(telegramId AS INTEGER) = ${telegramIdNum}
      `;
    }

    // Отримуємо оновлені дані
    const updatedUsers = await prisma.$queryRawUnsafe(
      `SELECT 
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
      WHERE CAST(telegramId AS INTEGER) = ?`,
      telegramIdNum
    ) as Array<{
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
    }>;

    const user = updatedUsers[0];

    return NextResponse.json({
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      balance: user.balance,
      rating: user.rating,
      reviewsCount: user.reviewsCount,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

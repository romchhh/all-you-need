import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'Missing telegramId' },
        { status: 400 }
      );
    }

    const telegramIdNum = BigInt(telegramId);

    // Перевіряємо чи таблиця існує, якщо ні - створюємо
    try {
      const tableExists = await prisma.$queryRawUnsafe(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='Referral'
      `) as Array<{ name: string }>;
      
      if (tableExists.length === 0) {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE Referral (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_telegram_id TEXT NOT NULL,
            referred_telegram_id TEXT NOT NULL UNIQUE,
            reward_paid INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            reward_paid_at TEXT
          )
        `);
      }
      
      // Створюємо індекси якщо їх немає
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_referral_referrer_telegram_id ON Referral(referrer_telegram_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_referral_referred_telegram_id ON Referral(referred_telegram_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_referral_reward_paid ON Referral(reward_paid)
      `);
    } catch (error) {
      // Таблиця вже існує або помилка створення - продовжуємо
      console.log('[Referral Stats] Table creation check:', error);
    }

    // Отримуємо статистику рефералів (використовуємо TEXT для порівняння)
    const referralStats = await prisma.$queryRawUnsafe(
      `SELECT 
        COUNT(*) as total_referrals,
        SUM(CASE WHEN reward_paid = 1 THEN 1 ELSE 0 END) as paid_referrals
      FROM Referral 
      WHERE referrer_telegram_id = ?`,
      telegramId.toString()
    ) as Array<{ total_referrals: bigint; paid_referrals: bigint }>;

    const stats = referralStats[0] || { total_referrals: BigInt(0), paid_referrals: BigInt(0) };
    const totalReward = Number(stats.paid_referrals) * 1.0;

    return NextResponse.json({
      success: true,
      stats: {
        total_referrals: Number(stats.total_referrals),
        paid_referrals: Number(stats.paid_referrals),
        total_reward: totalReward,
      },
    });
  } catch (error: any) {
    console.error('[Referral Stats API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executeWithRetry } from '@/lib/prisma';
import { requireAdminAuth } from '@/utils/adminAuth';
import { sendBalanceCreditedNotification } from '@/utils/telegramNotifications';

/**
 * POST /api/admin/users/[id]/credit-balance
 * Нарахування коштів на баланс користувача (тільки для адміна).
 * Body: { amount: number } — сума в EUR (додатнє число).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAuth();

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid user ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(body.amount);

    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive number' },
        { status: 400 }
      );
    }

    // Перевіряємо, чи існує користувач, отримуємо balance та telegramId для сповіщення
    const users = await executeWithRetry(() =>
      prisma.$queryRawUnsafe(
        'SELECT id, balance, CAST(telegramId AS INTEGER) as telegramId FROM User WHERE id = ?',
        userId
      ) as Promise<Array<{ id: number; balance: number; telegramId: number }>>
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const currentBalance = typeof users[0].balance === 'bigint' ? Number(users[0].balance) : users[0].balance;
    const newBalance = currentBalance + amount;
    const telegramId = typeof users[0].telegramId === 'bigint' ? Number(users[0].telegramId) : users[0].telegramId;

    await executeWithRetry(() =>
      prisma.$executeRawUnsafe(
        'UPDATE User SET balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        newBalance,
        userId
      )
    );

    // Відправляємо повідомлення користувачу в Telegram (не падаємо при помилці відправки)
    try {
      const sent = await sendBalanceCreditedNotification(telegramId, amount, newBalance);
      if (!sent) {
        console.warn('[credit-balance] Failed to send Telegram notification to user', userId);
      }
    } catch (err) {
      console.warn('[credit-balance] Error sending Telegram notification:', err);
    }

    return NextResponse.json({
      success: true,
      newBalance,
      creditedAmount: amount,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Error crediting balance:', error);
    return NextResponse.json(
      { error: 'Failed to credit balance' },
      { status: 500 }
    );
  }
}

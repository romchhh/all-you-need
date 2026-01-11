import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MONOBANK_API_URL = process.env.MONOBANK_API_URL || 'https://api.monobank.ua';
const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN;

/**
 * Перевірка статусу платежу через Monobank API
 * GET /api/payments/check-status?invoiceId=...
 */
export async function GET(request: NextRequest) {
  try {
    if (!MONOBANK_TOKEN) {
      return NextResponse.json(
        { error: 'Monobank token is not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const invoiceId = searchParams.get('invoiceId');

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'invoiceId is required' },
        { status: 400 }
      );
    }

    // Перевіряємо статус через Monobank API
    const response = await fetch(`${MONOBANK_API_URL}/api/merchant/invoice/status?invoiceId=${invoiceId}`, {
      method: 'GET',
      headers: {
        'X-Token': MONOBANK_TOKEN,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Monobank API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to check invoice status', details: errorText },
        { status: response.status }
      );
    }

    const statusData = await response.json();

    // Оновлюємо статус в базі даних (імітуємо вебхук)
    const payments = await prisma.$queryRawUnsafe(
      `SELECT id, userId, status, amountEur FROM Payment WHERE invoiceId = ?`,
      invoiceId
    ) as Array<{ id: number; userId: number; status: string; amountEur: number }>;

    if (payments[0]) {
      const payment = payments[0];
      const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const status = statusData.status || statusData.invoiceStatus;

      // Оновлюємо статус платежу
      await prisma.$executeRawUnsafe(
        `UPDATE Payment 
         SET status = ?, webhookData = ?, updatedAt = ?
         WHERE invoiceId = ?`,
        status,
        JSON.stringify(statusData),
        updateTime,
        invoiceId
      );

      // Якщо платіж успішний, поповнюємо баланс
      if (status === 'success' && payment.status !== 'success') {
        const amountInEur = payment.amountEur;

        // Оновлюємо баланс користувача
        await prisma.$executeRawUnsafe(
          `UPDATE User 
           SET balance = balance + ?, updatedAt = ?
           WHERE id = ?`,
          amountInEur,
          updateTime,
          payment.userId
        );

        // Створюємо транзакцію
        const { executeWithRetry } = await import('@/lib/prisma');
        await executeWithRetry(() =>
          prisma.$executeRawUnsafe(
            `INSERT INTO Transaction (userId, type, amount, currency, paymentMethod, status, description, metadata, createdAt, completedAt)
            VALUES (?, 'payment', ?, 'EUR', 'monobank', 'completed', ?, ?, ?, ?)`,
            payment.userId,
            amountInEur,
            `Поповнення балансу через Monobank (${invoiceId})`,
            JSON.stringify({ invoiceId, statusData }),
            updateTime,
            updateTime
          )
        );

        // Оновлюємо completedAt
        await prisma.$executeRawUnsafe(
          `UPDATE Payment SET completedAt = ? WHERE invoiceId = ?`,
          updateTime,
          invoiceId
        );

        console.log(`Balance updated for user ${payment.userId}: +${amountInEur} EUR (manual check)`);
      }
    }

    return NextResponse.json(statusData);
  } catch (error) {
    console.error('Error checking invoice status:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

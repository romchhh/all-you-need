import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Webhook для обробки статусів платежів від Monobank
 * POST /api/payments/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const webhookData = await request.json();
    
    console.log('Webhook received from Monobank:', JSON.stringify(webhookData, null, 2));
    
    // Згідно з документацією, вебхук містить дані про статус рахунку
    const { invoiceId, status, amount, ccy, createdAt, modifiedDate } = webhookData;

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'invoiceId is required' },
        { status: 400 }
      );
    }

    // Знаходимо платіж в базі даних
    const payments = await prisma.$queryRawUnsafe(
      `SELECT id, userId, status, amountEur FROM Payment WHERE invoiceId = ?`,
      invoiceId
    ) as Array<{ id: number; userId: number; status: string; amountEur: number }>;

    if (!payments[0]) {
      console.warn(`Payment not found for invoiceId: ${invoiceId}`);
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const payment = payments[0];
    const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Оновлюємо статус платежу
    await prisma.$executeRawUnsafe(
      `UPDATE Payment 
       SET status = ?, webhookData = ?, updatedAt = ?
       WHERE invoiceId = ?`,
      status,
      JSON.stringify(webhookData),
      updateTime,
      invoiceId
    );

    // Якщо платіж успішний (status === 'success'), поповнюємо баланс
    if (status === 'success' && payment.status !== 'success') {
      // Використовуємо суму в EUR (збережену в amountEur)
      const amountInEur = payment.amountEur;

      // Оновлюємо баланс користувача (атомарно)
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
          JSON.stringify({ invoiceId, webhookData }),
          updateTime,
          updateTime
        )
      );

      // Оновлюємо completedAt для платежу
      await prisma.$executeRawUnsafe(
        `UPDATE Payment SET completedAt = ? WHERE invoiceId = ?`,
        updateTime,
        invoiceId
      );

      console.log(`Balance updated for user ${payment.userId}: +${amountInEur} EUR`);
    } else {
      console.log(`Payment status updated to: ${status} for invoiceId: ${invoiceId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Важливо повернути 200, щоб Monobank не повторював вебхук
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 200 }
    );
  }
}

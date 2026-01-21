import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Webhook для обробки статусів платежів від Monobank
 * POST /api/payments/webhook
 */

// GET метод для перевірки доступності webhook
export async function GET(request: NextRequest) {
  console.log('[Webhook] GET request received - webhook is accessible');
  return NextResponse.json({ status: 'ok', message: 'Webhook endpoint is accessible' });
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Webhook] ========== NEW WEBHOOK REQUEST ==========');
    console.log('[Webhook] Headers:', Object.fromEntries(request.headers.entries()));
    
    const webhookData = await request.json();
    
    console.log('[Webhook] Received from Monobank:', JSON.stringify(webhookData, null, 2));
    
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
          `INSERT INTO "Transaction" (userId, type, amount, currency, paymentMethod, status, description, metadata, createdAt, completedAt)
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

    // Перевіряємо чи це оплата промо або пакету
    if (status === 'success') {
      // Перевіряємо PromotionPurchase
      const promotions = await prisma.$queryRawUnsafe(
        `SELECT id, listingId, promotionType FROM PromotionPurchase WHERE invoiceId = ? AND status = 'pending'`,
        invoiceId
      ) as Array<{ id: number; listingId: number; promotionType: string }>;

      if (promotions.length > 0) {
        console.log(`Processing promotion payment for invoiceId: ${invoiceId}`);
        const promotion = promotions[0];
        
        // Оновлюємо статус промо на 'paid'
        await prisma.$executeRawUnsafe(
          `UPDATE PromotionPurchase SET status = 'paid' WHERE id = ?`,
          promotion.id
        );

        // Перевіряємо поточний статус оголошення перед оновленням
        const listingStatus = await prisma.$queryRawUnsafe(
          `SELECT status FROM Listing WHERE id = ?`,
          promotion.listingId
        ) as Array<{ status: string }>;
        
        const currentStatus = listingStatus[0]?.status;
        const isRejected = currentStatus === 'rejected';
        
        // Оновлюємо оголошення: встановлюємо рекламу та статус pending_moderation
        const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + (promotion.promotionType === 'vip' ? 7 : promotion.promotionType === 'top_category' ? 3 : 1));
        
        // Для відхилених оголошень також очищаємо причину відхилення
        if (isRejected) {
          await prisma.$executeRawUnsafe(
            `UPDATE Listing SET 
              promotionType = ?, 
              promotionEnds = ?, 
              status = 'pending_moderation',
              moderationStatus = 'pending',
              rejectionReason = NULL,
              updatedAt = ? 
            WHERE id = ?`,
            promotion.promotionType,
            endsAt.toISOString(),
            nowStr,
            promotion.listingId
          );
        } else {
          await prisma.$executeRawUnsafe(
            `UPDATE Listing SET 
              promotionType = ?, 
              promotionEnds = ?, 
              status = 'pending_moderation',
              moderationStatus = 'pending',
              updatedAt = ? 
            WHERE id = ?`,
            promotion.promotionType,
            endsAt.toISOString(),
            nowStr,
            promotion.listingId
          );
        }

        // Відправляємо на модерацію в ТГ групу
        const { submitListingToModeration } = await import('@/utils/listingHelpers');
        await submitListingToModeration(promotion.listingId, isRejected).catch(err => {
          console.error('[Webhook] Failed to send listing to moderation group:', err);
        });

        console.log(`Promotion payment confirmed for listing ${promotion.listingId}: ${promotion.promotionType}, status set to pending_moderation`);
      }

      // Перевіряємо ListingPackagePurchase
      const packages = await prisma.$queryRawUnsafe(
        `SELECT id, listingsCount FROM ListingPackagePurchase WHERE invoiceId = ? AND status = 'pending'`,
        invoiceId
      ) as Array<{ id: number; listingsCount: number }>;

      if (packages.length > 0) {
        console.log(`Processing package payment for invoiceId: ${invoiceId}`);
        const pkg = packages[0];
        
        // Оновлюємо статус пакету на completed
        await prisma.$executeRawUnsafe(
          `UPDATE ListingPackagePurchase SET status = 'completed', paidAt = ? WHERE id = ?`,
          updateTime,
          pkg.id
        );

        // Додаємо пакети до балансу користувача
        await prisma.$executeRawUnsafe(
          `UPDATE User SET listingPackagesBalance = listingPackagesBalance + ?, updatedAt = ? WHERE id = ?`,
          pkg.listingsCount,
          updateTime,
          payment.userId
        );

        console.log(`Package added to user ${payment.userId}: +${pkg.listingsCount} listings`);
      }
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

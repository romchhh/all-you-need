import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import {
  PROMOTION_PRICES,
  isValidPromotionType,
  processPromotionPurchaseFromBalance,
  createPromotionPurchaseRecord,
} from '@/utils/paymentHelpers';
import type { PromotionType } from '@/utils/paymentConstants';
import { createMonobankInvoice } from '@/lib/monobank';

// Купити рекламу для оголошення
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId: telegramIdRaw, listingId, promotionType, paymentMethod } = body;

    console.log('[Promotions API] Request body:', { telegramIdRaw, listingId, promotionType, paymentMethod });

    if (!telegramIdRaw || !promotionType || !paymentMethod) {
      console.error('[Promotions API] Missing required fields:', { telegramIdRaw, listingId, promotionType, paymentMethod });
      return NextResponse.json(
        { error: 'Missing required fields', received: { telegramIdRaw, listingId, promotionType, paymentMethod } },
        { status: 400 }
      );
    }

    // Валідація типу реклами
    if (!isValidPromotionType(promotionType)) {
      return NextResponse.json(
        { error: 'Invalid promotion type' },
        { status: 400 }
      );
    }

    const telegramId = parseTelegramId(telegramIdRaw);
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const promotionInfo = PROMOTION_PRICES[promotionType as PromotionType];
    const parsedListingId = listingId ? parseInt(listingId) : undefined;

    // Оплата з балансу
    if (paymentMethod === 'balance') {
      console.log('[Promotions API] Balance payment selected');

      // Перевіряємо баланс
      if (user.balance < promotionInfo.price) {
        console.error('[Promotions API] Insufficient balance:', { balance: user.balance, price: promotionInfo.price });
        return NextResponse.json(
          { 
            error: 'Insufficient balance',
            balance: user.balance,
            required: promotionInfo.price,
          },
          { status: 400 }
        );
      }

      // Списуємо з балансу
      try {
        const result = await processPromotionPurchaseFromBalance(
          user.id,
          user.balance,
          promotionType as PromotionType,
          parsedListingId
        );

        console.log('[Promotions API] Balance payment successful');

        return NextResponse.json({
          success: true,
          message: 'Promotion purchased successfully',
          balance: result.newBalance,
        });
      } catch (error) {
        console.error('[Promotions API] Failed to process balance payment:', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to process payment' },
          { status: 500 }
        );
      }
    }

    // Пряма оплата через Monobank
    if (paymentMethod === 'direct') {
      console.log('[Promotions API] Direct payment selected - creating invoice directly');

      // Мапа назв промо
      const promotionNames: Record<string, string> = {
        'highlighted': 'Виділення',
        'top_category': 'ТОП категорії',
        'vip': 'VIP розміщення',
      };
      const promotionName = promotionNames[promotionType] || promotionType;

      try {
        // Створюємо інвойс напряму
        const invoiceData = await createMonobankInvoice({
          telegramId: telegramIdRaw,
          amount: promotionInfo.price,
          type: 'promotion',
          promotionType,
          listingId: parsedListingId,
          description: `Реклама оголошення: ${promotionName}`,
        });

        console.log('[Promotions API] Invoice created successfully:', invoiceData);

        const { invoiceId, pageUrl } = invoiceData;

        // Зберігаємо запис про очікування оплати з invoiceId
        console.log('[Promotions API] Saving promotion purchase record');
        await createPromotionPurchaseRecord(
          user.id,
          promotionType as PromotionType,
          'direct',
          parsedListingId,
          'pending',
          invoiceId
        );

        // Не змінюємо статус оголошення - залишаємо як є
        // Після підтвердження оплати через webhook статус буде змінений на pending_moderation
        console.log('[Promotions API] Invoice created, waiting for payment confirmation via webhook');

        console.log('[Promotions API] Returning success response with pageUrl:', pageUrl);

        return NextResponse.json({
          success: true,
          paymentRequired: true,
          invoiceId,
          amount: promotionInfo.price,
          pageUrl,
        });
      } catch (error) {
        console.error('[Promotions API] Failed to create invoice:', error);
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to create invoice' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid payment method' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error purchasing promotion:', error);
    return NextResponse.json(
      { error: 'Failed to purchase promotion' },
      { status: 500 }
    );
  }
}

// Отримати доступні типи реклами
export async function GET() {
  try {
    return NextResponse.json({
      promotions: PROMOTION_PRICES,
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promotions' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { findUserByTelegramId, parseTelegramId } from '@/utils/userHelpers';
import {
  PACKAGE_PRICES,
  isValidPackageType,
  processPackagePurchaseFromBalance,
  createPackagePurchaseRecord,
} from '@/utils/paymentHelpers';
import type { PackageType } from '@/utils/paymentConstants';
import { createMonobankInvoice } from '@/lib/monobank';

// Купити пакет оголошень
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId: telegramIdRaw, packageType, paymentMethod } = body;

    console.log('[Packages API] Request body:', { telegramIdRaw, packageType, paymentMethod });

    if (!telegramIdRaw || !packageType || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Валідація типу пакету
    if (!isValidPackageType(packageType)) {
      return NextResponse.json(
        { error: 'Invalid package type' },
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

    const packageInfo = PACKAGE_PRICES[packageType as PackageType];

    // Оплата з балансу
    if (paymentMethod === 'balance') {
      console.log('[Packages API] Balance payment selected');

      try {
        const { newBalance, newPackagesBalance } = await processPackagePurchaseFromBalance(
          user.id,
          user.balance,
          user.listingPackagesBalance || 0,
          packageType as PackageType
        );

        // Зберігаємо запис про покупку
        await createPackagePurchaseRecord(
          user.id,
          packageType as PackageType,
          'balance',
          'completed'
        );

        console.log('[Packages API] Balance payment successful');

        return NextResponse.json({
          success: true,
          newBalance,
          newPackagesBalance,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'Insufficient balance') {
          console.error('[Packages API] Insufficient balance');
          return NextResponse.json(
            { error: 'Insufficient balance' },
            { status: 400 }
          );
        }
        throw error;
      }
    } 
    
    // Пряма оплата через Monobank
    if (paymentMethod === 'direct') {
      console.log('[Packages API] Direct payment selected - creating invoice directly');

      // Назви пакетів
      const packageNames: Record<string, string> = {
        'pack_3': '3 оголошення',
        'pack_5': '5 оголошень',
        'pack_10': '10 оголошень',
        'pack_30': '30 оголошень',
      };
      const packageName = packageNames[packageType] || packageType;

      try {
        // Створюємо інвойс напряму
        const invoiceData = await createMonobankInvoice({
          telegramId: telegramIdRaw,
          amount: packageInfo.price,
          type: 'package',
          packageType,
          description: `Пакет: ${packageName}`,
        });

        console.log('[Packages API] Invoice created successfully:', invoiceData);

        const { invoiceId, pageUrl } = invoiceData;

        // Зберігаємо запис про очікування оплати
        await createPackagePurchaseRecord(
          user.id,
          packageType as PackageType,
          'direct',
          'pending',
          invoiceId
        );

        console.log('[Packages API] Returning success response with pageUrl:', pageUrl);

        return NextResponse.json({
          success: true,
          paymentRequired: true,
          invoiceId,
          amount: packageInfo.price,
          pageUrl,
        });
      } catch (error) {
        console.error('[Packages API] Failed to create invoice:', error);
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
    console.error('Error purchasing package:', error);
    return NextResponse.json(
      { error: 'Failed to purchase package' },
      { status: 500 }
    );
  }
}

// Отримати доступні пакети та баланс користувача
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramIdRaw = searchParams.get('telegramId');

    if (!telegramIdRaw) {
      return NextResponse.json(
        { error: 'Telegram ID is required' },
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

    return NextResponse.json({
      packages: PACKAGE_PRICES,
      currentBalance: user.listingPackagesBalance || 0,
      hasUsedFreeAd: user.hasUsedFreeAd || false,
    });
  } catch (error) {
    console.error('Error fetching packages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch packages' },
      { status: 500 }
    );
  }
}

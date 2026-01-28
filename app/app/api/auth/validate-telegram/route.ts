import { NextRequest, NextResponse } from 'next/server';
import { validateTelegramWebAppData, parseTelegramUser } from '@/lib/telegramAuth';

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json();
    
    console.log('[Validate Telegram API] Received validation request');
    console.log('[Validate Telegram API] initData length:', initData?.length || 0);
    
    if (!initData || initData.trim().length === 0) {
      console.error('[Validate Telegram API] No initData provided or empty');
      return NextResponse.json(
        { valid: false, error: 'No initData provided' },
        { status: 400 }
      );
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      console.error('[Validate Telegram API] TELEGRAM_BOT_TOKEN not set in environment');
      return NextResponse.json(
        { valid: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    console.log('[Validate Telegram API] Bot token found, validating...');

    // Валідуємо initData
    const isValid = validateTelegramWebAppData(initData, botToken);
    
    if (!isValid) {
      console.warn('[Validate Telegram API] ❌ Invalid initData - hash mismatch or malformed data');
      return NextResponse.json(
        { valid: false, error: 'Invalid Telegram data signature' },
        { status: 403 }
      );
    }

    // Парсимо дані користувача
    const user = parseTelegramUser(initData);
    
    if (!user) {
      console.warn('[Validate Telegram API] Could not parse user from initData');
      return NextResponse.json(
        { valid: false, error: 'Could not parse user data' },
        { status: 400 }
      );
    }

    console.log('[Validate Telegram API] ✅ Valid initData for user:', user.id);
    
    return NextResponse.json({
      valid: true,
      user: user,
    });
  } catch (error) {
    console.error('[Validate Telegram API] Unexpected error:', error);
    return NextResponse.json(
      { valid: false, error: 'Validation error' },
      { status: 500 }
    );
  }
}

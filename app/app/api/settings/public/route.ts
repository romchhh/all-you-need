import { NextResponse } from 'next/server';
import { getAllSystemSettings } from '@/utils/dbHelpers';

// Публічний endpoint для отримання налаштувань (без аутентифікації)
export async function GET() {
  try {
    const settingsObj = await getAllSystemSettings();

    // Повертаємо тільки публічні налаштування
    return NextResponse.json({
      settings: {
        paidListingsEnabled: settingsObj.paidListingsEnabled || false,
      }
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    // У разі помилки повертаємо дефолтні значення
    return NextResponse.json({
      settings: {
        paidListingsEnabled: false,
      }
    });
  }
}

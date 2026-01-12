import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/utils/adminAuth';
import { getAllSystemSettings, setSystemSetting } from '@/utils/dbHelpers';

// Отримати налаштування
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settingsObj = await getAllSystemSettings();

    // Якщо налаштування не існує, повертаємо дефолтні значення
    if (!settingsObj.paidListingsEnabled) {
      settingsObj.paidListingsEnabled = false;
    }

    return NextResponse.json({ settings: settingsObj });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// Оновити налаштування
export async function POST(request: NextRequest) {
  try {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { key, value, description } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    await setSystemSetting(key, value, description);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

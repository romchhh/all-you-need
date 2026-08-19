import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import {
  ADMIN_CREDENTIALS_ENV_HINT,
  resolveAdminCredentials,
} from '@/lib/adminCredentials';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const adminCreds = resolveAdminCredentials();

    if (!adminCreds) {
      return NextResponse.json(
        {
          error: 'Admin credentials not configured',
          hint: ADMIN_CREDENTIALS_ENV_HINT,
        },
        { status: 500 }
      );
    }

    if (username !== adminCreds.username || password !== adminCreds.password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Створюємо токен сесії
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Сесія на 24 години

    // Встановлюємо cookie з токеном
    const cookieStore = await cookies();
    cookieStore.set('admin_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error in admin login:', error);
    return NextResponse.json(
      { error: 'Failed to login' },
      { status: 500 }
    );
  }
}

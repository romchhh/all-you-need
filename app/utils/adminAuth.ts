import { cookies } from 'next/headers';

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('admin_session');
    return !!sessionToken;
  } catch (error) {
    return false;
  }
}

export async function requireAdminAuth() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    throw new Error('Unauthorized');
  }
}

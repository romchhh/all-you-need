import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Перевіряємо, чи шлях вже має префікс мови
  const hasLanguagePrefix = pathname.startsWith('/uk/') || pathname.startsWith('/ru/') || pathname === '/uk' || pathname === '/ru';
  
  // Якщо немає префіксу мови, перенаправляємо на українську за замовчуванням
  // Але не перенаправляємо API routes, статичні файли та інші системні шляхи
  if (!hasLanguagePrefix && 
      pathname !== '/favicon.ico' && 
      !pathname.startsWith('/api') && 
      !pathname.startsWith('/_next') &&
      !pathname.startsWith('/images') &&
      !pathname.startsWith('/listings') &&
      !pathname.startsWith('/avatars') &&
      pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/uk${pathname}`;
    return NextResponse.redirect(url);
  }
  
  // Якщо користувач зайшов на головну сторінку без мови, перенаправляємо на /uk
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/uk';
    return NextResponse.redirect(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};


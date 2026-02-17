'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MenuItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

const menuItems: MenuItem[] = [
  { href: '/admin', label: 'Статистика', icon: '📊' },
  { href: '/admin/listings?source=marketplace', label: 'Оголошення маркетплейсу', icon: '🌐' },
  { href: '/admin/listings/moderation', label: 'На модерації', icon: '⏳', badge: undefined },
  { href: '/admin/listings/import', label: 'Імпорт оголошень', icon: '📥' },
  { href: '/admin/users', label: 'Користувачі', icon: '👥' },
  { href: '/admin/finances', label: 'Фінанси', icon: '💰' },
  { href: '/admin/settings', label: 'Налаштування', icon: '⚙️' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  // Закриваємо меню при переході на іншу сторінку
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Завантажуємо кількість оголошень на модерації
    fetch('/api/admin/stats')
      .then((res) => res.json())
      .then((data) => {
        if (data.listings?.byStatus?.pending) {
          setPendingCount(data.listings.byStatus.pending);
        }
      })
      .catch(() => {
        // Ігноруємо помилки
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      {/* Burger menu button - видимий на всіх пристроях */}
      <div className="fixed top-3 left-3 z-50">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-2.5 rounded-md bg-white shadow-lg text-gray-900 hover:bg-gray-50 transition-all duration-300 ${
            isMenuOpen ? 'transform rotate-90' : ''
          }`}
          aria-label={isMenuOpen ? "Закрити меню" : "Відкрити меню"}
        >
          {isMenuOpen ? (
            <svg 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          ) : (
            <svg 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 6h16M4 12h16M4 18h16" 
              />
            </svg>
          )}
        </button>
      </div>

      {/* Sidebar - завжди прихований за замовчуванням, відкривається тільки при натисканні */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-xl z-40 transform transition-transform duration-300 ease-in-out ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="p-4 sm:p-6 border-b border-gray-200 flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900">
                Адмін панель
              </h1>
              <p className="text-xs sm:text-sm text-gray-900 mt-1">
                Trade Ground Marketplace
              </p>
            </div>
            {/* Close button - видимий на всіх пристроях */}
            <button
              onClick={() => setIsMenuOpen(false)}
              className="ml-3 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Закрити меню"
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
            </button>
          </div>

          {/* Menu */}
          <nav className="flex-1 p-3 sm:p-4 space-y-1 sm:space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              // Перевіряємо активний пункт меню з урахуванням query параметрів
              let isActive = false;
              if (item.href.includes('?')) {
                const [path, query] = item.href.split('?');
                const params = new URLSearchParams(query);
                const sourceParam = params.get('source');
                isActive = pathname === path && searchParams?.get('source') === sourceParam;
              } else {
                isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
              }
              const badgeCount = item.href === '/admin/listings/moderation' ? pendingCount : item.badge;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg transition-colors relative
                    ${
                      isActive
                        ? 'bg-indigo-100 text-indigo-900 font-medium'
                        : 'text-gray-900 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <span className="text-lg sm:text-xl">{item.icon}</span>
                    <span className="text-sm sm:text-base">{item.label}</span>
                  </div>
                  {badgeCount !== null && badgeCount !== undefined && badgeCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full min-w-[20px] text-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout button */}
          <div className="p-3 sm:p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 sm:py-3 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors text-sm sm:text-base"
            >
              <span>🚪</span>
              <span>Вихід</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay - видимий на всіх пристроях коли меню відкрите */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
}

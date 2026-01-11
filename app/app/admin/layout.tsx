'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Додаємо клас admin-panel до body
    document.body.classList.add('admin-panel');
    
    return () => {
      // Видаляємо клас при unmount
      document.body.classList.remove('admin-panel');
    };
  }, []);

  useEffect(() => {
    // Перевіряємо автентифікацію
    if (pathname === '/admin/login') {
      setIsAuthenticated(false);
      return;
    }

    fetch('/api/admin/auth/check')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          router.push('/admin/login');
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        router.push('/admin/login');
      });
  }, [pathname, router]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-900">Завантаження...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 pt-16 w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-full">{children}</div>
      </main>
    </div>
  );
}

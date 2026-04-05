'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';

function isExemptPath(pathname: string): boolean {
  if (pathname.startsWith('/admin')) return true;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return true;
  const rest = segments.slice(1).join('/');
  return rest === 'complete-registration' || rest.startsWith('complete-registration/') || rest === 'oferta' || rest.startsWith('oferta/');
}

function RegistrationGateInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { loading, isRegistrationIncomplete } = useUser();

  useEffect(() => {
    if (!pathname.startsWith('/uk/') && !pathname.startsWith('/ru/')) return;
    if (isExemptPath(pathname)) return;
    if (loading || !isRegistrationIncomplete) return;
    const lang = pathname.split('/')[1] || 'uk';
    router.replace(`/${lang}/complete-registration`);
  }, [pathname, loading, isRegistrationIncomplete, router]);

  return <>{children}</>;
}

export function RegistrationGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <RegistrationGateInner>{children}</RegistrationGateInner>
    </Suspense>
  );
}

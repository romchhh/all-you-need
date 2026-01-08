'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const AYNMarketplace = () => {
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) || 'uk';
  
  // Перенаправляємо на сторінку bazaar
  useEffect(() => {
    router.replace(`/${lang}/bazaar`);
  }, [lang, router]);

  return null;
};

export default AYNMarketplace;

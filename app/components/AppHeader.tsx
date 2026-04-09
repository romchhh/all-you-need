'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';

export const AppHeader: React.FC = () => {
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) || 'uk';

  const handleClick = () => {
    // Переходимо на головну сторінку та оновлюємо
    if (typeof window !== 'undefined') {
      window.location.href = `/${lang}/bazaar`;
    }
  };

  return (
    <div className="w-full shrink-0 min-h-0" style={{ paddingTop: '1mm' }}>
      <div
        className="mx-auto flex w-full min-h-0 cursor-pointer items-center justify-center overflow-hidden px-4"
        role="presentation"
        onClick={handleClick}
        style={{
          /* Рядок хедера: лого ніколи не вище цього; у низькому svh стискається */
          height: 'min(2.25rem, 11svh)',
        }}
      >
        <Image
          src="/images/Group 1000007086.svg"
          alt="Trade Ground"
          width={140}
          height={45}
          sizes="(max-width: 480px) 85vw, 12rem"
          className="max-h-full w-auto max-w-full object-contain object-center"
          style={{ height: 'auto', maxHeight: '100%', width: 'auto' }}
          priority
          unoptimized
        />
      </div>
    </div>
  );
};

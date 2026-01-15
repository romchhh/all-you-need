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
    <div 
      className="w-full cursor-pointer" 
      onClick={handleClick}
      style={{ 
        height: '52.5px'
      }}
    >
      <div className="w-full h-full mx-auto px-4 flex items-center justify-center">
        <Image 
          src="/images/Group 1000007086.svg" 
          alt="Trade Ground" 
          width={204} 
          height={64.5}
          className="w-auto object-contain"
          style={{ height: '52.5px', width: 'auto' }}
          priority
        />
      </div>
    </div>
  );
};

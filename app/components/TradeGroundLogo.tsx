'use client';

import React from 'react';
import Image from 'next/image';

export type TradeGroundLogoProps = {
  onClick?: () => void;
  /** Класи зовнішнього блоку (відступи, transform для swipe тощо) */
  className?: string;
  style?: React.CSSProperties;
  /** Горизонтальні відступи рядка логотипу (false — якщо вже є px у батька, напр. модалка) */
  paddingX?: boolean;
  /** Прозорість зображення */
  imageOpacity?: number;
};

/**
 * Логотип Trade Ground: завжди вміщується по висоті рядка (min(2.25rem, 11svh)).
 */
export function TradeGroundLogo({
  onClick,
  className = '',
  style,
  paddingX = true,
  imageOpacity = 1,
}: TradeGroundLogoProps) {
  return (
    <div className={`w-full shrink-0 min-h-0 ${className}`} style={style}>
      <div
        className={`mx-auto flex w-full min-h-0 max-w-full items-center justify-center overflow-hidden ${
          paddingX ? 'px-4' : ''
        } ${onClick ? 'cursor-pointer' : ''}`}
        style={{ height: 'min(2.25rem, 11svh)' }}
        onClick={onClick}
        role={onClick ? 'presentation' : undefined}
      >
        <Image
          src="/images/Group 1000007086.svg"
          alt="Trade Ground"
          width={140}
          height={45}
          sizes="(max-width: 480px) 85vw, 12rem"
          className="max-h-full w-auto max-w-full object-contain object-center"
          style={{ height: 'auto', maxHeight: '100%', width: 'auto', opacity: imageOpacity }}
          priority
          unoptimized
        />
      </div>
    </div>
  );
}

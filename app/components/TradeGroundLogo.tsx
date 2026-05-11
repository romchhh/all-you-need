'use client';

import React from 'react';
import Image from 'next/image';
import { useTheme } from '@/contexts/ThemeContext';

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
 * Логотип Trade Ground: один рядок 2.25rem + відступи як на головній (max-lg:pt-3, lg:pt-[1mm]).
 */
/** Відступи як у AppHeader на головній — не дублювати в кожному місці */
const LOGO_ROW_PADDING = 'max-lg:pt-3 lg:pt-[1mm]';
/** Фіксована висота рядка логотипу (як на головній), без 11svh — розмір стабільний скрізь */
const LOGO_ROW_HEIGHT = '2.25rem';

const LOGO_SRC_DARK = '/images/Group 1000007086.svg';
/** Світла тема: темний текст з градієнтом, «пакетик» чорний */
const LOGO_SRC_LIGHT = '/images/Group-1000007086-light.svg';

export function TradeGroundLogo({
  onClick,
  className = '',
  style,
  paddingX = true,
  imageOpacity = 1,
}: TradeGroundLogoProps) {
  const { isLight } = useTheme();
  const logoSrc = isLight ? LOGO_SRC_LIGHT : LOGO_SRC_DARK;

  return (
    <div className={`w-full shrink-0 min-h-0 ${LOGO_ROW_PADDING} ${className}`.trim()} style={style}>
      <div
        className={`mx-auto flex w-full min-h-0 max-w-full items-center justify-center overflow-hidden ${
          paddingX ? 'px-4' : ''
        } ${onClick ? 'cursor-pointer' : ''}`}
        style={{ height: LOGO_ROW_HEIGHT, minHeight: LOGO_ROW_HEIGHT }}
        onClick={onClick}
        role={onClick ? 'presentation' : undefined}
      >
        <Image
          key={logoSrc}
          src={logoSrc}
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

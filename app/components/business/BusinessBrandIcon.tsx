'use client';

import { useTheme } from '@/contexts/ThemeContext';

type BusinessBrandIconProps = {
  size?: number;
  className?: string;
};

/** TradeGround Business — storefront + verified badge (TG Business–inspired, brand colors via currentColor). */
export function BusinessBrandIcon({ size = 24, className = '' }: BusinessBrandIconProps) {
  const { isLight } = useTheme();
  const badgeCheck = isLight ? '#ffffff' : '#141414';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M3.5 9.25c1.85-1.35 3.65-1.35 5.5 0s3.65 1.35 5.5 0 3.65-1.35 5.5 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 9.25V11.5h16V9.25L19.2 5.8a1.35 1.35 0 0 0-1.25-.8H6.05a1.35 1.35 0 0 0-1.25.8L4 9.25Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M5 11.5h14V19a1.35 1.35 0 0 1-1.35 1.35H6.35A1.35 1.35 0 0 1 5 19v-7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 20.35V14.1a.9.9 0 0 1 .9-.9h1.7a.9.9 0 0 1 .9.9v6.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.15 14.5h2.1M14.75 14.5h2.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.75" cy="6.65" r="3.1" fill="currentColor" />
      <path
        d="M16.55 6.65l.78.78 1.42-1.42"
        stroke={badgeCheck}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

'use client';

import { useId } from 'react';
import { X } from 'lucide-react';
import { getAppearanceClasses } from '@/utils/appearanceClasses';

export type BusinessContactChannel = 'telegram' | 'phone' | 'instagram' | 'website';

const TELEGRAM_ICON_SRC = '/images/contacts/telegram.svg';

type BusinessContactBrandIconProps = {
  channel: BusinessContactChannel;
  size?: number;
  className?: string;
};

export function BusinessContactBrandIcon({
  channel,
  size = 40,
  className = '',
}: BusinessContactBrandIconProps) {
  const instagramGradId = useId().replace(/:/g, '');
  const r = size * 0.22;

  if (channel === 'telegram') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={TELEGRAM_ICON_SRC}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className={`shrink-0 rounded-full ${className}`}
      />
    );
  }

  if (channel === 'phone') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
        aria-hidden
      >
        <rect width="40" height="40" rx={r} fill="#C8E6A0" />
        <path
          d="M15.2 12.4c.8-.8 2.1-.8 2.9 0l1.6 1.6c.7.7.8 1.8.2 2.6l-1.1 1.5c-.3.4-.3.9 0 1.3.9 1.2 2.2 2.5 3.4 3.4.4.3.9.3 1.3 0l1.5-1.1c.8-.6 1.9-.5 2.6.2l1.6 1.6c.8.8.8 2.1 0 2.9l-1.2 1.2c-.9.9-2.2 1.2-3.4.8-2.6-.9-5.5-3.1-8-5.6s-4.7-5.4-5.6-8c-.4-1.2-.1-2.5.8-3.4l1.2-1.2z"
          fill="#141414"
        />
      </svg>
    );
  }

  if (channel === 'instagram') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`shrink-0 ${className}`}
        aria-hidden
      >
        <defs>
          <linearGradient id={instagramGradId} x1="8" y1="32" x2="32" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#833AB4" />
            <stop offset="0.5" stopColor="#FD1D1D" />
            <stop offset="1" stopColor="#FCAF45" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx={r} fill={`url(#${instagramGradId})`} />
        <rect x="12" y="12" width="16" height="16" rx="5" stroke="#fff" strokeWidth="2" />
        <circle cx="20" cy="20" r="3.8" stroke="#fff" strokeWidth="2" />
        <circle cx="26.2" cy="13.8" r="1.4" fill="#fff" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden
    >
      <rect width="40" height="40" rx={r} fill="#2A2A2A" />
      <circle cx="20" cy="20" r="8.5" stroke="#fff" strokeWidth="1.8" />
      <ellipse cx="20" cy="20" rx="3.5" ry="8.5" stroke="#fff" strokeWidth="1.8" />
      <path d="M11.5 20h17" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

type BusinessContactFieldProps = {
  channel: BusinessContactChannel;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  isLight: boolean;
  placeholder?: string;
};

export function BusinessContactField({
  channel,
  label,
  hint,
  value,
  onChange,
  isLight,
  placeholder,
}: BusinessContactFieldProps) {
  const ac = getAppearanceClasses(isLight);
  const shell = isLight
    ? 'border border-gray-200 bg-gray-50'
    : 'border border-white/10 bg-[#1C1C1C]';

  return (
    <div>
      <label className={`mb-1.5 block text-sm font-medium ${isLight ? 'text-gray-700' : 'text-white/80'}`}>
        {label}
      </label>
      <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${shell}`}>
        <BusinessContactBrandIcon channel={channel} size={36} />
        <input
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
            isLight ? 'text-gray-900 placeholder:text-gray-400' : 'text-white placeholder:text-white/35'
          }`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {value.trim() ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange('')}
            className={`rounded-full p-1 ${isLight ? 'text-gray-400 hover:bg-gray-200/80' : 'text-white/45 hover:bg-white/10'}`}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
      {hint ? <p className={`mt-1.5 text-xs ${ac.mutedText}`}>{hint}</p> : null}
    </div>
  );
}

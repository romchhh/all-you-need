/** Shared TradeGround Business profile UI tokens (mockup lime accent). */

export const BUSINESS_LIME = '#C8E6A0';
export const BUSINESS_LIME_DARK = '#3F5331';
export const BUSINESS_ON_LIME = '#1a1a1a';

export function getBusinessProfileUi(isLight: boolean) {
  const cardShell = isLight
    ? 'rounded-2xl border border-[#3F5331]/12 bg-white'
    : 'rounded-2xl border border-[#C8E6A0]/15 bg-[#141414]';

  const limeBorder = isLight ? 'border-[#3F5331]/35' : 'border-[#C8E6A0]/35';
  const limeText = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';
  const limeBg = 'bg-[#C8E6A0]';
  const limeBgSoft = isLight ? 'bg-[#C8E6A0]/20' : 'bg-[#C8E6A0]/10';

  const btnSolid =
    'inline-flex items-center justify-center gap-2 rounded-2xl bg-[#C8E6A0] px-4 py-3 text-sm font-semibold text-[#1a1a1a] transition-opacity hover:opacity-90 active:opacity-80';

  const btnSolidSm =
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#C8E6A0] px-3 py-2 text-xs font-semibold text-[#1a1a1a] transition-opacity hover:opacity-90 active:opacity-80';

  const btnOutline = `inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${limeBorder} ${limeText} ${
    isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
  }`;

  const btnOutlineSm = `inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${limeBorder} ${limeText} ${
    isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
  }`;

  const btnIconOutline = `inline-flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl border transition-colors ${limeBorder} ${limeText} ${
    isLight ? 'hover:bg-[#E8F0E0]/70' : 'hover:bg-[#C8E6A0]/10'
  }`;

  const btnDangerOutline = `inline-flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
    isLight
      ? 'border-red-400/50 text-red-600 hover:bg-red-50'
      : 'border-red-500/45 text-red-400 hover:bg-red-500/10'
  }`;

  const tabActive = `${limeBg} text-[#1a1a1a]`;
  const tabIdle = isLight ? 'text-gray-600 hover:bg-gray-100' : 'text-white/65 hover:bg-white/10';

  const divider = isLight ? 'border-[#3F5331]/10' : 'border-white/10';

  return {
    cardShell,
    limeBorder,
    limeText,
    limeBg,
    limeBgSoft,
    btnSolid,
    btnSolidSm,
    btnOutline,
    btnOutlineSm,
    btnIconOutline,
    btnDangerOutline,
    tabActive,
    tabIdle,
    divider,
  };
}

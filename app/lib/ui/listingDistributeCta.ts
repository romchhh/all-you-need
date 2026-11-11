/** Solid secondary styling for «Поширити» — not transparent; distinct from lime «Рекламувати». */
export function listingDistributeButtonClass(isLight: boolean): string {
  return isLight
    ? 'bg-[#3F5331] text-white hover:opacity-95 active:opacity-90 [&_svg]:text-white'
    : 'bg-[#1e2a18] text-[#C8E6A0] border-2 border-[#4a6340] hover:bg-[#2a3820] [&_svg]:text-[#C8E6A0]';
}

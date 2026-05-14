/** Shared Tailwind class strings for light vs dark appearance (mini-app marketplace). */

export type AppearanceClasses = {
  /** Обраний чіп / пункт у формі (створення, редагування оголошення). У темній темі — світло-зелена акцентна підсвітка. */
  formChipSelected: string;
  /** Квадратик «галочка» в активному стані поруч із чіпами. */
  formCheckboxFilled: string;
  /** Підсвітка активного превью фото (drag / reorder). */
  formPhotoActiveRing: string;
  /** Фокус текстових полів / textarea у формі оголошення. */
  formFocusRing: string;
  /** Колір тексту акценту всередині форми (іконки, галочки). */
  formAccentFg: string;
  /** Активний сегмент (сітка / список тощо). */
  segmentedActive: string;
  /** Підсвітка обраного рядка в меню (валюта, стан тощо). */
  formMenuRowSelected: string;
  toggleGroup: string;
  toggleInactive: string;
  pageHeading: string;
  mutedText: string;
  suggestionDropdown: string;
  suggestionRow: string;
  suggestionIcon: string;
  ghostIconButton: string;
  ghostIconButtonActiveBorder: string;
  ghostIconButtonInactiveIcon: string;
  ghostIconButtonActiveIcon: string;
  categoryRowLabel: string;
  outlineButton: string;
  subcategoryIdle: string;
  nothingFound: string;
  profileCard: string;
  profileCardText: string;
  profileCardChevron: string;
  salesFilterBar: string;
  salesFilterBarText: string;
  salesFilterChevron: string;
  salesEmptyHint: string;
  listRowHover: string;
};

export function getAppearanceClasses(isLight: boolean): AppearanceClasses {
  if (isLight) {
    return {
      formChipSelected: 'border-[#3F5331] bg-[#3F5331]/20 text-[#3F5331] shadow-sm',
      formCheckboxFilled: 'border-[#3F5331] bg-[#3F5331]',
      formPhotoActiveRing:
        'ring-2 ring-[#3F5331] ring-offset-2 ring-offset-gray-100 border-[#3F5331]/30',
      formFocusRing: 'focus:outline-none focus:ring-2 focus:ring-[#3F5331]/50 focus:border-[#3F5331]',
      segmentedActive: 'bg-[#3F5331] text-white shadow-sm',
      formMenuRowSelected: 'bg-[#3F5331]/20 text-[#3F5331] font-semibold',
      formAccentFg: 'text-[#3F5331]',
      toggleGroup: 'bg-black/[0.05] ring-1 ring-gray-900/[0.06]',
      toggleInactive: 'text-gray-500 hover:text-gray-900',
      pageHeading: 'text-gray-900',
      mutedText: 'text-gray-600',
      suggestionDropdown:
        'rounded-2xl border border-gray-200/90 bg-white/95 shadow-lg shadow-gray-900/10 backdrop-blur-md ring-1 ring-black/[0.03]',
      suggestionRow:
        'flex w-full items-center gap-2 border-b border-gray-100/80 px-4 py-3 text-left text-gray-900 transition-colors last:border-b-0 hover:bg-gray-50/90',
      suggestionIcon: 'text-gray-400',
      ghostIconButton:
        'relative flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200/90 bg-white/80 shadow-sm transition-colors hover:border-gray-300 hover:bg-white',
      ghostIconButtonActiveBorder: 'border-[#3F5331]/35 bg-[#3F5331]/15 ring-1 ring-[#3F5331]/20',
      ghostIconButtonInactiveIcon: 'text-gray-700',
      ghostIconButtonActiveIcon: 'text-[#3F5331]',
      categoryRowLabel: 'text-gray-800',
      outlineButton:
        'rounded-xl border border-gray-200/90 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50/90 hover:shadow',
      subcategoryIdle:
        'rounded-xl border border-gray-200/90 bg-white/60 text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-white',
      nothingFound: 'text-gray-600',
      profileCard:
        'flex flex-1 items-center justify-between rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 text-sm shadow-sm transition-all hover:border-gray-300/90 hover:shadow-md',
      profileCardText: 'text-gray-900',
      profileCardChevron: 'text-gray-500',
      salesFilterBar:
        'w-full rounded-2xl bg-gray-100/95 py-4 font-semibold text-gray-900 shadow-sm ring-1 ring-gray-900/[0.04] transition-colors hover:bg-gray-200/75',
      salesFilterBarText: 'text-gray-900',
      salesFilterChevron: 'text-gray-500',
      salesEmptyHint: 'text-gray-600',
      listRowHover: 'text-gray-900 hover:bg-gray-50/90',
    };
  }
  // Dark accents: BRAND_GREEN_ON_DARK (#C8E6A0) — same as primary CTA on listing page (ListingDetail listingPrimaryCtaClass).
  return {
    formChipSelected:
      'border-[#C8E6A0] bg-[#C8E6A0]/14 text-[#C8E6A0] shadow-sm shadow-[0_0_14px_rgba(200,230,160,0.18)] ring-1 ring-[#C8E6A0]/30',
    formCheckboxFilled: 'border-[#C8E6A0] bg-[#C8E6A0]',
    formPhotoActiveRing:
      'ring-2 ring-[#C8E6A0]/90 ring-offset-2 ring-offset-[#0A0A0A] border-[#C8E6A0]/50',
    formFocusRing: 'focus:outline-none focus:ring-2 focus:ring-[#C8E6A0]/35 focus:border-[#C8E6A0]',
    segmentedActive:
      'bg-[#C8E6A0] text-[#0f1408] shadow-[0_0_16px_rgba(200,230,160,0.45)] ring-1 ring-[#C8E6A0]/55',
    formMenuRowSelected: 'bg-[#C8E6A0]/12 text-[#C8E6A0] font-semibold',
    formAccentFg: 'text-[#C8E6A0]',
    toggleGroup: 'bg-gray-800/50',
    toggleInactive: 'text-gray-400 hover:text-white',
    pageHeading: 'text-white',
    mutedText: 'text-white/70',
    suggestionDropdown: 'bg-gray-900 rounded-xl border border-gray-700 shadow-lg',
    suggestionRow:
      'w-full px-4 py-3 text-left hover:bg-gray-800 transition-colors flex items-center gap-2 text-white border-b border-gray-700 last:border-b-0',
    suggestionIcon: 'text-gray-400',
    ghostIconButton:
      'w-12 h-12 rounded-xl flex items-center justify-center transition-colors relative border border-white bg-transparent hover:bg-white/10',
    ghostIconButtonActiveBorder:
      'border-[#C8E6A0]/85 bg-[#C8E6A0]/10 ring-1 ring-[#C8E6A0]/35',
    ghostIconButtonInactiveIcon: 'text-white',
    ghostIconButtonActiveIcon: 'text-[#C8E6A0]',
    categoryRowLabel: 'text-white',
    outlineButton:
      'px-4 py-2 rounded-xl text-sm font-medium border border-white text-white bg-transparent hover:bg-white/10 transition-colors',
    subcategoryIdle: 'border border-white text-white bg-transparent hover:bg-white/10',
    nothingFound: 'text-gray-400',
    profileCard:
      'flex-1 px-3 py-2.5 bg-[#000000] rounded-xl border border-white/20 flex items-center justify-between text-sm hover:border-white/40 transition-colors',
    profileCardText: 'text-white',
    profileCardChevron: 'text-white/70',
    salesFilterBar:
      'w-full bg-gray-800/50 hover:bg-gray-700/50 text-white font-semibold py-4 rounded-2xl transition-colors',
    salesFilterBarText: 'text-white',
    salesFilterChevron: 'text-white/70',
    salesEmptyHint: 'text-white/70',
    listRowHover: 'text-white hover:bg-white/10',
  };
}

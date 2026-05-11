/** Shared Tailwind class strings for light vs dark appearance (mini-app marketplace). */

export type AppearanceClasses = {
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
  return {
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
    ghostIconButtonActiveBorder: 'border-[#3F5331] bg-transparent',
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

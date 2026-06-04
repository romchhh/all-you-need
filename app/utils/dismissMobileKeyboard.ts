/** Знімає фокус з активного поля — ховає клавіатуру в Telegram WebView / мобільних браузерах. */
export function dismissMobileKeyboard(): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

'use client';

type IosSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/** Перемикач у стилі iOS (UISwitch). */
export function IosSwitch({
  checked,
  onChange,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: IosSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full transition-[background-color] duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34C759]/50 disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? 'bg-[#34C759]' : 'bg-[#787880]/55 dark:bg-[#39393D]'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

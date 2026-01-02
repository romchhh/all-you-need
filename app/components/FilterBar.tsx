import { ArrowUpDown } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';

interface FilterBarProps {
  onSortClick: () => void;
  sortLabel: string;
  tg: TelegramWebApp | null;
}

export const FilterBar = ({ onSortClick, sortLabel, tg }: FilterBarProps) => (
  <div className="px-4 py-3 bg-white border-b border-gray-100">
    <button
      onClick={() => {
        onSortClick();
        tg?.HapticFeedback.impactOccurred('light');
      }}
      className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
    >
      <div className="flex items-center gap-2">
        <ArrowUpDown size={16} className="text-gray-500" />
        <span className="text-sm text-gray-700">Сортування</span>
      </div>
      <span className="text-sm font-medium text-gray-900">{sortLabel}</span>
    </button>
  </div>
);


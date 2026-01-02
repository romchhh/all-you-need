import { X } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';

type SortOption = 'newest' | 'price_low' | 'price_high' | 'popular';

interface SortModalProps {
  isOpen: boolean;
  currentSort: SortOption;
  onClose: () => void;
  onSelect: (sort: SortOption) => void;
  tg: TelegramWebApp | null;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Новіші спочатку' },
  { value: 'price_low', label: 'Від дешевих до дорогих' },
  { value: 'price_high', label: 'Від дорогих до дешевих' },
  { value: 'popular', label: 'Найпопулярніші' }
];

export const SortModal = ({ isOpen, currentSort, onClose, onSelect, tg }: SortModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={onClose}>
      <div 
        className="w-full bg-white rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">Сортування</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={18} className="text-gray-900" />
          </button>
        </div>

        <div className="space-y-2">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onSelect(option.value);
                tg?.HapticFeedback.impactOccurred('light');
                onClose();
              }}
              className={`w-full text-left p-4 rounded-xl transition-all ${
                currentSort === option.value
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'bg-gray-50 text-gray-900 hover:bg-gray-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


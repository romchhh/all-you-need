import { X, AlertTriangle } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
  tg?: TelegramWebApp | null;
}

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Підтвердити',
  cancelText = 'Скасувати',
  confirmButtonClass = 'bg-red-500 hover:bg-red-600',
  tg
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
    tg?.HapticFeedback.impactOccurred('medium');
  };

  const handleCancel = () => {
    onClose();
    tg?.HapticFeedback.impactOccurred('light');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 overflow-hidden">
      <div className="bg-[#000000] rounded-2xl border-2 border-white p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center">
            <AlertTriangle size={24} className="text-[#D3F1A7]" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-white mb-2 text-center">{title}</h3>
        <p className="text-white/70 mb-6 text-center text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 bg-transparent border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-3 ${confirmButtonClass === 'bg-red-500 hover:bg-red-600' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 text-black'} rounded-xl font-medium transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};


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
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">{title}</h3>
        <p className="text-gray-600 mb-6 text-center text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-3 ${confirmButtonClass} text-white rounded-xl font-medium transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};


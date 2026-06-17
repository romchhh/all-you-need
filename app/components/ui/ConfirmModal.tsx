'use client';

import { AlertTriangle } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useTheme } from '@/contexts/ThemeContext';

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
  const { isLight } = useTheme();

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

  const overlay = isLight ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/50 backdrop-blur-sm';
  const card = isLight
    ? 'bg-white rounded-2xl border-2 border-gray-200/90 p-6 max-w-sm w-full shadow-2xl ring-1 ring-black/[0.05]'
    : 'bg-[#000000] rounded-2xl border-2 border-white p-6 max-w-sm w-full shadow-2xl';
  const iconWrap = isLight
    ? 'w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center'
    : 'w-12 h-12 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center';
  const titleCls = isLight ? 'text-gray-900' : 'text-white';
  const msgCls = isLight ? 'text-gray-600' : 'text-white/70';
  const cancelBtn = isLight
    ? 'flex-1 px-4 py-3 bg-transparent border border-gray-300 text-gray-900 rounded-xl font-medium hover:bg-gray-100 transition-colors'
    : 'flex-1 px-4 py-3 bg-transparent border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-colors';

  const confirmCls =
    confirmButtonClass === 'bg-red-500 hover:bg-red-600'
      ? 'bg-red-500 hover:bg-red-600 text-white'
      : `${confirmButtonClass || 'bg-[#3F5331] hover:bg-[#344728]'} text-white`;

  return (
    <div
      className={`fixed inset-0 z-[100010] flex max-lg:flex-col max-lg:items-center max-lg:justify-start justify-center overflow-y-auto overscroll-contain p-4 max-lg:pt-[max(32dvh,calc(env(safe-area-inset-top,0px)+9rem))] lg:items-center lg:justify-center lg:pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] ${overlay}`}
    >
      <div className={card}>
        <div className="flex items-center justify-center mb-4">
          <div className={iconWrap}>
            <AlertTriangle size={24} className={isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'} />
          </div>
        </div>
        <h3 className={`text-xl font-bold mb-2 text-center ${titleCls}`}>{title}</h3>
        <p className={`mb-6 text-center text-sm leading-relaxed ${msgCls}`}>{message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={handleCancel} className={cancelBtn}>
            {cancelText}
          </button>
          <button type="button" onClick={handleConfirm} className={`flex-1 px-4 py-3 rounded-xl font-medium transition-colors ${confirmCls}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

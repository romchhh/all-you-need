import { X, Upload, User } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { getAvatarColor } from '@/utils/avatarColors';
import { useState, useEffect } from 'react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFirstName: string | null;
  currentLastName: string | null;
  currentAvatar: string | null;
  onSave: (firstName: string, lastName: string, avatar: File | null) => void;
  tg: TelegramWebApp | null;
}

export const EditProfileModal = ({
  isOpen,
  onClose,
  currentFirstName,
  currentLastName,
  currentAvatar,
  onSave,
  tg
}: EditProfileModalProps) => {
  const [firstName, setFirstName] = useState(currentFirstName || '');
  const [lastName, setLastName] = useState(currentLastName || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentAvatar);
  const [loading, setLoading] = useState(false);

  // Блокуємо скрол body та html при відкритому модальному вікні
  useEffect(() => {
    if (isOpen) {
      // Зберігаємо поточну позицію скролу
      const scrollY = window.scrollY;
      // Блокуємо скрол на body та html
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
      // Розблоковуємо скрол
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    
    // Cleanup при розмонтуванні
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(firstName, lastName, avatarFile);
      tg?.HapticFeedback.notificationOccurred('success');
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      tg?.showAlert('Помилка при збереженні профілю');
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Редагувати профіль</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-900" />
          </button>
        </div>

        {/* Аватар */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 mb-4 relative">
            {avatarPreview ? (
              <img 
                src={avatarPreview} 
                alt="Avatar"
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(`${firstName || ''} ${lastName || ''}`.trim() || 'User')} text-white text-3xl font-bold`}>
                {(firstName || lastName) ? (firstName.charAt(0) + (lastName?.charAt(0) || '')).toUpperCase() : 'U'}
              </div>
            )}
          </div>
          <label className="px-4 py-2 bg-blue-500 text-white rounded-xl cursor-pointer hover:bg-blue-600 transition-colors flex items-center gap-2">
            <Upload size={18} />
            <span>Змінити фото</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Ім'я */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ім'я
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Введіть ім'я"
            className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Прізвище */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Прізвище
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Введіть прізвище"
            className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Кнопки */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !firstName.trim()}
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>
      </div>
    </div>
  );
};


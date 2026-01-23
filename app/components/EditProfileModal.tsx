import { X, Upload, User } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { getAvatarColor } from '@/utils/avatarColors';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFirstName: string | null;
  currentLastName: string | null;
  currentPhone: string | null;
  currentAvatar: string | null;
  onSave: (firstName: string, lastName: string, phone: string, avatar: File | null) => void;
  tg: TelegramWebApp | null;
}

export const EditProfileModal = ({
  isOpen,
  onClose,
  currentFirstName,
  currentLastName,
  currentPhone,
  currentAvatar,
  onSave,
  tg
}: EditProfileModalProps) => {
  const [firstName, setFirstName] = useState(currentFirstName || '');
  const [lastName, setLastName] = useState(currentLastName || '');
  const [phone, setPhone] = useState(currentPhone || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentAvatar);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string>('');
  const { toast, showToast, hideToast } = useToast();
  const { t } = useLanguage();

  // Валідація номера телефону
  const validatePhone = (phoneNumber: string): boolean => {
    if (!phoneNumber.trim()) {
      setPhoneError('');
      return true; // Телефон не обов'язковий
    }
    
    // Видаляємо всі символи крім цифр та +
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    
    // Перевіряємо формат: +380XXXXXXXXX або 380XXXXXXXXX або 0XXXXXXXXX
    const ukrainianPattern = /^(\+?380|0)?[0-9]{9}$/;
    const internationalPattern = /^\+[1-9]\d{1,14}$/;
    
    if (cleaned.startsWith('+380') || cleaned.startsWith('380') || cleaned.startsWith('0')) {
      // Український формат
      const digitsOnly = cleaned.replace(/^\+?380|^0/, '');
      if (digitsOnly.length === 9 && /^[0-9]{9}$/.test(digitsOnly)) {
        setPhoneError('');
        return true;
      }
      setPhoneError(t('profile.phoneInvalid') || 'Невірний формат телефону. Використовуйте формат: +380XXXXXXXXX');
      return false;
    } else if (cleaned.startsWith('+')) {
      // Міжнародний формат
      if (internationalPattern.test(cleaned)) {
        setPhoneError('');
        return true;
      }
      setPhoneError(t('profile.phoneInvalid') || 'Невірний формат телефону');
      return false;
    }
    
    setPhoneError(t('profile.phoneInvalid') || 'Невірний формат телефону. Використовуйте формат: +380XXXXXXXXX');
    return false;
  };

  // Обробка зміни номера телефону з автоматичним форматуванням
  const handlePhoneChange = (value: string) => {
    // Видаляємо всі символи крім цифр та +
    let cleaned = value.replace(/[^\d+]/g, '');
    
    // Якщо починається з 380, додаємо +
    if (cleaned.startsWith('380') && !cleaned.startsWith('+380')) {
      cleaned = '+' + cleaned;
    }
    // Якщо починається з 0, замінюємо на +380
    if (cleaned.startsWith('0') && cleaned.length > 1) {
      cleaned = '+380' + cleaned.substring(1);
    }
    // Якщо починається з цифри (не 0), додаємо +380
    if (/^[1-9]/.test(cleaned) && !cleaned.startsWith('+')) {
      cleaned = '+380' + cleaned;
    }
    
    setPhone(cleaned);
    validatePhone(cleaned);
  };

  // Оновлюємо локальний стан при зміні props
  useEffect(() => {
    if (isOpen) {
      setFirstName(currentFirstName || '');
      setLastName(currentLastName || '');
      setPhone(currentPhone || '');
      setAvatarPreview(currentAvatar);
      setAvatarFile(null);
      setPhoneError('');
    }
  }, [isOpen, currentFirstName, currentLastName, currentPhone, currentAvatar]);

  // Блокуємо скрол body та html при відкритому модальному вікні та запобігаємо свайпу вниз
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
      
      // Запобігаємо pull-to-close (свайп вниз для закриття)
      let touchStartY: number | null = null;
      let touchStartScrollY: number | null = null;
      
      const handleTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
          touchStartY = touch.clientY;
          touchStartScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        }
      };
      
      const preventPullToClose = (e: TouchEvent) => {
        if (touchStartY === null || touchStartScrollY === null) {
          return;
        }
        
        const touch = e.touches[0];
        if (!touch) return;
        
        const deltaY = touch.clientY - touchStartY;
        const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        
        // Ніколи не блокуємо скрол вгору (негативний deltaY)
        if (deltaY < 0) {
          return;
        }
        
        // Дозволяємо згортання тільки якщо користувач тягне за саму верхню частину (білу смужку/header)
        // AppHeader має висоту ~52.5px, додаємо невеликий запас - 60px
        const headerHeight = 60;
        const isPullingFromHeader = touchStartY < headerHeight;
        
        // Якщо користувач тягне за header (верхні 60px) і на початку скролу - дозволяємо згортання
        if (touchStartScrollY <= 10 && isPullingFromHeader && deltaY > 0 && deltaY > 5) {
          // Дозволяємо згортання - не запобігаємо
          return;
        }
        
        // Якщо користувач тягне не з header - запобігаємо згортанню тільки на початку скролу
        if (deltaY > 0 && deltaY > 5) {
          if (touchStartScrollY <= 10 || (currentScrollY === 0 && deltaY > 10)) {
            if (!isPullingFromHeader) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      };
      
      const handleTouchEnd = () => {
        touchStartY = null;
        touchStartScrollY = null;
      };
      
      // Додаємо обробники для запобігання свайпу вниз
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', preventPullToClose, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      
      // Cleanup для видалення обробників
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.documentElement.style.overflow = '';
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', preventPullToClose);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('touchcancel', handleTouchEnd);
      };
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
    // Валідація перед збереженням
    if (!validatePhone(phone)) {
      tg?.HapticFeedback.notificationOccurred('error');
      return;
    }
    
    setLoading(true);
    try {
      await onSave(firstName, lastName, phone.trim(), avatarFile);
      tg?.HapticFeedback.notificationOccurred('success');
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      if (tg) {
        tg.showAlert(t('profile.saveError'));
      } else {
        showToast(t('profile.saveError'), 'error');
      }
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-start sm:items-center justify-center p-4 pb-24 sm:pb-4 overflow-y-auto"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => {
        // Запобігаємо свайпу вниз для закриття додатку
        e.stopPropagation();
      }}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{ touchAction: 'none' }}
    >
      <div className="bg-[#000000] rounded-3xl border-2 border-white w-full max-w-md p-6 shadow-2xl relative z-[100000] my-4 sm:my-0 max-h-[calc(100vh-8rem)] sm:max-h-[90vh] overflow-y-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">{t('profile.editProfile')}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={20} className="text-white" />
          </button>
        </div>

        {/* Аватар */}
        <div className="flex flex-col items-center mb-6">
          <label className="block text-sm font-medium text-white mb-2">{t('profile.avatar')}</label>
          <div className="w-24 h-24 rounded-full overflow-hidden bg-white border-2 border-white mb-4 relative">
            {avatarPreview ? (
              <img 
                src={avatarPreview} 
                alt={t('profile.avatar')}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const placeholder = parent.querySelector('.avatar-placeholder');
                    if (placeholder) {
                      placeholder.classList.remove('hidden');
                    }
                  }
                }}
              />
            ) : null}
            <div className={`${avatarPreview ? 'hidden' : ''} avatar-placeholder w-full h-full flex items-center justify-center bg-gradient-to-br ${getAvatarColor(`${firstName || ''} ${lastName || ''}`.trim() || 'User')} text-white text-3xl font-bold`}>
              {(firstName || lastName) ? (firstName.charAt(0) + (lastName?.charAt(0) || '')).toUpperCase() : 'U'}
            </div>
          </div>
          <label className="px-4 py-2 bg-transparent border-2 border-white text-white rounded-xl cursor-pointer hover:bg-white/10 transition-colors flex items-center gap-2">
            <Upload size={18} />
            <span>{t('profile.changePhoto')}</span>
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
          <label className="block text-sm font-medium text-white mb-2">
            {t('profile.firstName')}
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('profile.firstNamePlaceholder')}
            className="w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]"
          />
        </div>

        {/* Прізвище */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-white mb-2">
            {t('profile.lastName')}
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t('profile.lastNamePlaceholder')}
            className="w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]"
          />
        </div>

        {/* Телефон */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white mb-2">
            {t('profile.phone') || 'Номер телефону'}
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder={t('profile.phonePlaceholder') || '+380XXXXXXXXX'}
            className={`w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border ${
              phoneError 
                ? 'border-red-500 focus:ring-2 focus:ring-red-500/50' 
                : 'border-white/20 focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]'
            } text-white placeholder:text-white/50 focus:outline-none`}
          />
          {phoneError && (
            <p className="mt-1 text-sm text-red-500">{phoneError}</p>
          )}
          <p className="mt-1 text-xs text-white/50">
            {t('profile.phoneHint') || 'Формат: +380XXXXXXXXX (не обов\'язково)'}
          </p>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-transparent border border-white/20 text-white rounded-xl font-medium hover:bg-white/10 transition-colors"
          >
            {t('common.cancel') || 'Скасувати'}
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !firstName.trim()}
            className="flex-1 px-4 py-3 bg-[#D3F1A7] text-black rounded-xl font-medium hover:bg-[#D3F1A7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (t('common.saving') || 'Збереження...') : (t('common.save') || 'Зберегти')}
          </button>
        </div>
      </div>

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};


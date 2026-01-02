import { X, Upload, Image as ImageIcon, ChevronDown, MapPin, Trash2 } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Listing } from '@/types';
import { useState, useRef, useEffect } from 'react';
import { categories } from '@/constants/categories';
import { ukrainianCities, searchCities } from '@/constants/ukrainian-cities';

interface EditListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  onSave: (listingData: any) => Promise<void>;
  onDelete: () => Promise<void>;
  tg: TelegramWebApp | null;
}

export const EditListingModal = ({
  isOpen,
  onClose,
  listing,
  onSave,
  onDelete,
  tg
}: EditListingModalProps) => {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [price, setPrice] = useState(listing.isFree ? '' : listing.price);
  const [isFree, setIsFree] = useState(listing.isFree || false);
  const [category, setCategory] = useState(listing.category);
  const [subcategory, setSubcategory] = useState(listing.subcategory || '');
  const [location, setLocation] = useState(listing.location);
  const [condition, setCondition] = useState<'new' | 'like_new' | 'good' | 'fair'>(listing.condition || 'new');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>(listing.images || [listing.image]);
  const [loading, setLoading] = useState(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [status, setStatus] = useState<string>(listing.status || 'active');
  const conditionRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);

  const selectedCategoryData = categories.find(cat => cat.id === category);

  type ConditionType = 'new' | 'like_new' | 'good' | 'fair';

  const conditionOptions: Array<{ value: ConditionType; label: string; emoji: string }> = [
    { value: 'new', label: 'Новий', emoji: '✨' },
    { value: 'like_new', label: 'Як новий', emoji: '🆕' },
    { value: 'good', label: 'Добрий', emoji: '👍' },
    { value: 'fair', label: 'Задовільний', emoji: '✅' },
  ];

  const selectedCondition = conditionOptions.find(opt => opt.value === condition);

  const filteredCities = locationQuery
    ? searchCities(locationQuery, 10)
    : [];

  useEffect(() => {
    if (isOpen) {
      setTitle(listing.title);
      setDescription(listing.description);
      setPrice(listing.isFree ? '' : listing.price);
      setIsFree(listing.isFree || false);
      setCategory(listing.category);
      setSubcategory(listing.subcategory || '');
      setLocation(listing.location);
      setCondition((listing.condition || 'new') as 'new' | 'like_new' | 'good' | 'fair');
      setImagePreviews(listing.images || [listing.image]);
      setImages([]);
      setStatus(listing.status || 'active');
      setErrors({});
    }
  }, [isOpen, listing]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (conditionRef.current && !conditionRef.current.contains(event.target as Node)) {
        setIsConditionOpen(false);
      }
      if (locationRef.current && !locationRef.current.contains(event.target as Node)) {
        setIsLocationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + imagePreviews.length > 10) {
      setErrors(prev => ({ ...prev, images: 'Максимум 10 фото' }));
      return;
    }
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    
    setImages(prev => [...prev, ...files]);
    if (errors.images) setErrors(prev => ({ ...prev, images: '' }));
  };

  const removeImage = (index: number) => {
    if (index < imagePreviews.length - images.length) {
      // Видаляємо старе зображення
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      // Видаляємо нове зображення
      const newIndex = index - (imagePreviews.length - images.length);
      setImages(prev => prev.filter((_, i) => i !== newIndex));
      setImagePreviews(prev => prev.filter((_, i) => i !== index));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Введіть назву товару';
    } else if (title.trim().length < 3) {
      newErrors.title = 'Назва має містити мінімум 3 символи';
    }

    if (!description.trim()) {
      newErrors.description = 'Введіть опис товару';
    } else if (description.trim().length < 10) {
      newErrors.description = 'Опис має містити мінімум 10 символів';
    }

    if (!isFree) {
      if (!price.trim()) {
        newErrors.price = 'Введіть ціну';
      } else {
        const priceNum = parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (isNaN(priceNum) || priceNum <= 0) {
          newErrors.price = 'Введіть коректну ціну';
        }
      }
    }

    if (!category) {
      newErrors.category = 'Оберіть розділ';
    }

    if (imagePreviews.length === 0) {
      newErrors.images = 'Додайте хоча б одне фото';
    }

    if (!location.trim()) {
      newErrors.location = 'Введіть локацію';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      await onSave({
        title,
        description,
        price: isFree ? 'Безкоштовно' : price,
        isFree,
        category,
        subcategory: subcategory || null,
        condition: condition || null,
        location,
        images,
        imagePreviews,
      });
      onClose();
    } catch (error) {
      console.error('Error saving listing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      console.error('Error deleting listing:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-slide-up">
        {/* Хедер */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-gray-900">Редагувати оголошення</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors text-gray-900"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Фото */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Фото * {imagePreviews.length}/10
            </label>
            <div className="grid grid-cols-3 gap-3">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {imagePreviews.length < 10 && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                  <div className="text-center">
                    <Upload size={24} className="text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-500">Додати</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {errors.images && (
              <p className="mt-1 text-sm text-red-600">{errors.images}</p>
            )}
          </div>

          {/* Заголовок */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Заголовок *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
              }}
              placeholder="Наприклад: iPhone 13 Pro Max"
              className={`w-full px-4 py-3 bg-gray-50 rounded-xl border ${
                errors.title ? 'border-red-300' : 'border-gray-200'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              maxLength={100}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          {/* Опис */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Опис *
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
              }}
              placeholder="Детальний опис товару..."
              rows={4}
              className={`w-full px-4 py-3 bg-gray-50 rounded-xl border ${
                errors.description ? 'border-red-300' : 'border-gray-200'
              } focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
              maxLength={2000}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Ціна */}
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Безкоштовно</span>
            </label>
            {!isFree && (
              <>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
                  }}
                  placeholder="Ціна (наприклад: 5000 грн)"
                  className={`w-full px-4 py-3 bg-gray-50 rounded-xl border ${
                    errors.price ? 'border-red-300' : 'border-gray-200'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                {errors.price && (
                  <p className="mt-1 text-sm text-red-600">{errors.price}</p>
                )}
              </>
            )}
          </div>

          {/* Розділ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Розділ *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategory(cat.id);
                    setSubcategory('');
                    if (errors.category) setErrors(prev => ({ ...prev, category: '' }));
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    category === cat.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : errors.category
                      ? 'border-red-300 bg-white text-gray-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-medium text-sm">{cat.name}</span>
                  </div>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="mt-1 text-sm text-red-600">{errors.category}</p>
            )}
          </div>

          {/* Тип */}
          {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Тип (необов'язково)
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubcategory('');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    !subcategory
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Всі типи
                </button>
                {selectedCategoryData.subcategories.map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSubcategory(sub.id);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`px-4 py-2 rounded-xl border-2 transition-all ${
                      subcategory === sub.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Стан */}
          <div className="relative" ref={conditionRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Стан (необов'язково)
            </label>
            <button
              type="button"
              onClick={() => setIsConditionOpen(!isConditionOpen)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                {selectedCondition && (
                  <>
                    <span className="text-lg">{selectedCondition.emoji}</span>
                    <span className="text-gray-700 font-medium">{selectedCondition.label}</span>
                  </>
                )}
                {!selectedCondition && (
                  <span className="text-gray-400">Оберіть стан</span>
                )}
              </div>
              <ChevronDown size={20} className={`text-gray-400 transition-transform ${isConditionOpen ? 'rotate-180' : ''}`} />
            </button>
            {isConditionOpen && (
              <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-20">
                {conditionOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setCondition(option.value);
                      setIsConditionOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{option.emoji}</span>
                      <span>{option.label}</span>
                    </div>
                    {selectedCondition?.value === option.value && (
                      <span className="text-blue-500">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Локація */}
          <div className="relative" ref={locationRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Локація *
            </label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setLocationQuery(e.target.value);
                  setIsLocationOpen(true);
                  if (errors.location) setErrors(prev => ({ ...prev, location: '' }));
                }}
                onFocus={() => setIsLocationOpen(true)}
                placeholder="Оберіть або введіть місто"
                className={`w-full px-4 py-3 pl-10 bg-gray-50 rounded-xl border ${
                  errors.location ? 'border-red-300' : 'border-gray-200'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <MapPin 
                size={18} 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
            
            {isLocationOpen && filteredCities.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg max-h-60 overflow-y-auto">
                {filteredCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setLocation(city);
                      setLocationQuery('');
                      setIsLocationOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-700"
                  >
                    <MapPin size={16} className="text-gray-400" />
                    <span>{city}</span>
                  </button>
                ))}
              </div>
            )}
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location}</p>
            )}
          </div>

          {/* Статус */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Статус
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Активне</option>
              <option value="sold">Продано</option>
              <option value="hidden">Приховано</option>
            </select>
          </div>
        </div>

        {/* Кнопки */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Trash2 size={18} />
            Видалити
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>
        </div>

        {/* Підтвердження видалення */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Видалити оголошення?</h3>
              <p className="text-gray-600 mb-6">Цю дію неможливо скасувати.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


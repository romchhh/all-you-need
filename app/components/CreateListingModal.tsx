import { X, Upload, Image as ImageIcon, ChevronDown, MapPin } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Category } from '@/types';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getCategories } from '@/constants/categories';
import { germanCities } from '@/constants/german-cities';
import { ukrainianCities } from '@/constants/ukrainian-cities';
import { useLanguage } from '@/contexts/LanguageContext';

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (listingData: any) => void;
  tg: TelegramWebApp | null;
}

export const CreateListingModal = ({
  isOpen,
  onClose,
  onSave,
  tg
}: CreateListingModalProps) => {
  const { t } = useLanguage();
  const categories = getCategories(t);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'UAH' | 'EUR' | 'USD'>('UAH');
  const [isFree, setIsFree] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<string>('new');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const conditionRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLDivElement>(null);

  const selectedCategoryData = categories.find(cat => cat.id === category);

  const conditionOptions = [
    { value: 'new', label: t('listing.new'), emoji: '✨' },
    { value: 'used', label: t('listing.used'), emoji: '🔧' },
  ];

  const selectedCondition = conditionOptions.find(opt => opt.value === condition);

  // Об'єднуємо німецькі та українські міста
  const allCities = useMemo(() => {
    const combined = [...germanCities, ...ukrainianCities];
    // Видаляємо дублікати та сортуємо
    return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
  }, []);

  // Фільтруємо міста за запитом
  const filteredCities = locationQuery
    ? allCities.filter(city =>
        city.toLowerCase().includes(locationQuery.toLowerCase())
      ).slice(0, 10)
    : allCities.slice(0, 10);

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
      
      // Для мобільних пристроїв
      document.body.style.touchAction = 'none';
    } else {
      // Відновлюємо скрол
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.body.style.touchAction = '';
      
      // Відновлюємо позицію скролу
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      // Cleanup
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  // Закриваємо dropdown при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (conditionRef.current && !conditionRef.current.contains(event.target as Node)) {
        setIsConditionOpen(false);
      }
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        setIsCurrencyOpen(false);
      }
      if (locationRef.current && !locationRef.current.contains(event.target as Node)) {
        setIsLocationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 10) {
      tg?.showAlert(t('createListing.maxPhotos'));
      return;
    }

    const newImages = [...images, ...files];
    setImages(newImages);

    // Створюємо прев'ю
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = t('createListing.errors.titleRequired');
    } else if (title.trim().length < 3) {
      newErrors.title = t('createListing.errors.titleMinLength');
    }

    if (!description.trim()) {
      newErrors.description = t('createListing.errors.descriptionRequired');
    } else if (description.trim().length < 10) {
      newErrors.description = t('createListing.errors.descriptionMinLength');
    }

    if (!isFree) {
      if (!price.trim()) {
        newErrors.price = t('createListing.errors.priceRequired');
      } else {
        const priceNum = parseFloat(price.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (isNaN(priceNum) || priceNum <= 0) {
          newErrors.price = t('createListing.errors.priceInvalid');
        }
      }
    }

    if (!category) {
      newErrors.category = t('createListing.errors.categoryRequired');
    }

    if (images.length === 0) {
      newErrors.images = t('createListing.errors.imagesRequired');
    } else if (images.length > 10) {
      newErrors.images = t('createListing.errors.imagesMax');
    }

    if (!location.trim()) {
      newErrors.location = t('createListing.errors.locationRequired');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    if (!title.trim() || !description.trim() || !location.trim()) {
      tg?.showAlert(t('createListing.fillAllFields'));
      return;
    }

    if (!category) {
      tg?.showAlert(t('createListing.selectCategory'));
      return;
    }

    if (!isFree && !price.trim()) {
      tg?.showAlert(t('createListing.enterPriceOrFree'));
      return;
    }

    if (images.length === 0) {
      tg?.showAlert(t('createListing.addPhoto'));
      return;
    }

    setLoading(true);
    try {
      await onSave({
        title,
        description,
        price: isFree ? t('common.free') : price,
        currency: currency,
        isFree,
        category,
        subcategory: subcategory || null,
        location,
        condition,
        images,
      });
      tg?.HapticFeedback.notificationOccurred('success');
      
      // Очищаємо форму
      setTitle('');
      setDescription('');
      setPrice('');
      setIsFree(false);
      setCategory('');
      setSubcategory('');
      setLocation('');
      setCondition('new');
      setCurrency('UAH');
      setImages([]);
      setImagePreviews([]);
      
      onClose();
    } catch (error) {
      console.error('Error creating listing:', error);
      tg?.showAlert(t('createListing.errorCreating'));
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[60] flex flex-col overflow-hidden">
      <div className="bg-white w-full h-full flex flex-col">
        {/* Заголовок */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">{t('createListing.title')}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-900" />
          </button>
        </div>

        <div className="px-4 space-y-4 overflow-y-auto flex-1 min-h-0 pb-4">
          {/* Фото */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createListing.photosLabel')}
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <img 
                    src={preview} 
                    alt={`Preview ${index + 1}`} 
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length < 10 && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                  <Upload size={24} className="text-gray-400" />
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
          </div>

          {/* Заголовок */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createListing.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
              }}
              placeholder={t('createListing.titlePlaceholder')}
              className={`w-full px-4 py-3 bg-gray-50 rounded-xl border text-gray-900 placeholder:text-gray-400 ${
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
              {t('createListing.descriptionLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
              }}
              placeholder={t('createListing.descriptionPlaceholder')}
              rows={4}
              className={`w-full px-4 py-3 bg-gray-50 rounded-xl border text-gray-900 placeholder:text-gray-400 ${
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
              <span className="text-sm font-medium text-gray-700">{t('common.free')}</span>
            </label>
            {!isFree && (
              <>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
                    }}
                    placeholder={t('createListing.pricePlaceholder')}
                    className={`flex-1 px-4 py-3 bg-gray-50 rounded-xl border text-gray-900 placeholder:text-gray-400 ${
                      errors.price ? 'border-red-300' : 'border-gray-200'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <div ref={currencyRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCurrencyOpen(!isCurrencyOpen);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors flex items-center gap-2 min-w-[80px]"
                    >
                      <span className="text-gray-900 font-medium">
                        {currency === 'UAH' ? '₴' : currency === 'EUR' ? '€' : '$'}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${isCurrencyOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isCurrencyOpen && (
                      <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-30 min-w-[120px]">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrency('UAH');
                            setIsCurrencyOpen(false);
                            tg?.HapticFeedback.impactOccurred('light');
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
                            currency === 'UAH' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>₴ UAH</span>
                        </button>
                        <div className="h-px bg-gray-200"></div>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrency('EUR');
                            setIsCurrencyOpen(false);
                            tg?.HapticFeedback.impactOccurred('light');
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
                            currency === 'EUR' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>€ EUR</span>
                        </button>
                        <div className="h-px bg-gray-200"></div>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrency('USD');
                            setIsCurrencyOpen(false);
                            tg?.HapticFeedback.impactOccurred('light');
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
                            currency === 'USD' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span>$ USD</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {errors.price && (
                  <p className="mt-1 text-sm text-red-600">{errors.price}</p>
                )}
              </>
            )}
          </div>

          {/* Розділ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('createListing.categoryLabel')}
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
                {t('createListing.subcategoryLabel')}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubcategory('');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    subcategory === ''
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {t('createListing.allTypes')}
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
          <div ref={conditionRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createListing.conditionLabel')}
            </label>
            <button
              type="button"
              onClick={() => {
                setIsConditionOpen(!isConditionOpen);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {selectedCondition && (
                  <>
                    <span className="text-lg">{selectedCondition.emoji}</span>
                    <span className="text-gray-700 font-medium">{selectedCondition.label}</span>
                  </>
                )}
                {!selectedCondition && (
                  <span className="text-gray-400">{t('createListing.fields.selectCondition')}</span>
                )}
              </div>
              <ChevronDown 
                size={20} 
                className={`text-gray-400 transition-transform ${isConditionOpen ? 'rotate-180' : ''}`}
              />
            </button>
            
            {isConditionOpen && (
              <div className="absolute z-50 w-full mt-2 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                {conditionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setCondition(option.value);
                      setIsConditionOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                      condition === option.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <span className="text-xl">{option.emoji}</span>
                    <span className="font-medium">{option.label}</span>
                    {condition === option.value && (
                      <span className="ml-auto text-blue-500">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Локація */}
          <div ref={locationRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('createListing.locationLabel')}
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
                placeholder={t('createListing.locationPlaceholder')}
                className={`w-full px-4 py-3 pl-10 pr-10 bg-gray-50 rounded-xl border text-gray-900 placeholder:text-gray-400 ${
                  errors.location ? 'border-red-300' : 'border-gray-200'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <MapPin 
                size={18} 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500"
              />
              {location && (
                <button
                  type="button"
                  onClick={() => {
                    setLocation('');
                    setLocationQuery('');
                    setIsLocationOpen(false);
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors"
                >
                  <X size={14} className="text-gray-900" />
                </button>
              )}
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
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-2 text-gray-700 border-b border-gray-100 last:border-b-0"
                  >
                    <MapPin size={16} className="text-green-500" />
                    <span>{city}</span>
                  </button>
                ))}
              </div>
            )}
            {errors.location && (
              <p className="mt-1 text-sm text-red-600">{errors.location}</p>
            )}
          </div>
          {errors.images && (
            <p className="mt-1 text-sm text-red-600">{errors.images}</p>
          )}
        </div>

        {/* Кнопки */}
        <div className="bg-white border-t border-gray-200 px-4 pt-4 pb-10 flex gap-2 flex-shrink-0 safe-area-bottom">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-3 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('createListing.creating') : t('createListing.title')}
          </button>
        </div>
      </div>
    </div>
  );
};


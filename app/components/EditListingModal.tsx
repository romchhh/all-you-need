import { X, Upload, Image as ImageIcon, ChevronDown, MapPin, Trash2, Sparkles, Wrench, CheckCircle, Tag, EyeOff } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Listing } from '@/types';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getCategories } from '@/constants/categories';
import { germanCities } from '@/constants/german-cities';
import { useLanguage } from '@/contexts/LanguageContext';
import { ConfirmModal } from './ConfirmModal';
import { CategoryIcon } from './CategoryIcon';

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
  const { t } = useLanguage();
  const categories = getCategories(t);
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [price, setPrice] = useState(listing.isFree ? '' : listing.price);
  const [currency, setCurrency] = useState<'UAH' | 'EUR' | 'USD'>(listing.currency || 'UAH');
  const [isFree, setIsFree] = useState(listing.isFree || false);
  const [category, setCategory] = useState(listing.category);
  const [subcategory, setSubcategory] = useState(listing.subcategory || '');
  const [location, setLocation] = useState(listing.location);
  const [condition, setCondition] = useState<'new' | 'used'>(
    listing.condition === 'new' ? 'new' : (listing.condition ? 'used' : 'new')
  );
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>(listing.images || [listing.image]);
  const [loading, setLoading] = useState(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSoldConfirm, setShowSoldConfirm] = useState(false);
  const [status, setStatus] = useState<string>(listing.status || 'active');
  const conditionRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const [currencyMenuPosition, setCurrencyMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  const selectedCategoryData = categories.find(cat => cat.id === category);

  type ConditionType = 'new' | 'used';

  const conditionOptions: Array<{ value: ConditionType; label: string; icon: typeof Sparkles | typeof Wrench }> = [
    { value: 'new', label: t('listing.new'), icon: Sparkles },
    { value: 'used', label: t('listing.used'), icon: Wrench },
  ];

  const selectedCondition = conditionOptions.find(opt => opt.value === condition);

  // Фільтруємо міста за запитом (по ключових літерах, як на головній сторінці)
  const filteredCities = useMemo(() => {
    if (!locationQuery.trim()) {
      return isLocationOpen ? germanCities.slice(0, 10) : [];
    }
    const query = locationQuery.toLowerCase().trim();
    // Пошук по ключових літерах (починається з або містить)
    return germanCities.filter(city =>
      city.toLowerCase().startsWith(query) || city.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [locationQuery, isLocationOpen]);

  useEffect(() => {
    if (isOpen) {
      setTitle(listing.title);
      setDescription(listing.description);
      setPrice(listing.isFree ? '' : listing.price);
      setIsFree(listing.isFree || false);
      setCategory(listing.category);
      setSubcategory(listing.subcategory || '');
      setLocation(listing.location);
      setCondition(listing.condition === 'new' ? 'new' : (listing.condition ? 'used' : 'new'));
      setCurrency(listing.currency || 'UAH');
      // Оновлюємо imagePreviews - фільтруємо null/undefined значення
      const existingImages = (listing.images || (listing.image ? [listing.image] : [])).filter(Boolean);
      setImagePreviews(existingImages);
      setImages([]);
      setStatus(listing.status || 'active');
      setErrors({});
    }
  }, [isOpen, listing]);

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

  // Оновлюємо позицію меню валюти при відкритті
  useEffect(() => {
    if (isCurrencyOpen && currencyRef.current) {
      const rect = currencyRef.current.getBoundingClientRect();
      // Зсуваємо вліво на 30% від ширини кнопки
      const leftOffset = rect.width * 0.3;
      const menuWidth = Math.min(rect.width, window.innerWidth - 32);
      const left = Math.max(16, Math.min(rect.left - leftOffset, window.innerWidth - menuWidth - 16));
      
      setCurrencyMenuPosition({
        top: rect.bottom,
        left: left,
        width: menuWidth
      });
    }
  }, [isCurrencyOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (conditionRef.current && !conditionRef.current.contains(event.target as Node)) {
        setIsConditionOpen(false);
      }
      // Перевіряємо клік поза меню валюти
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        // Перевіряємо чи клік не на самому меню валюти
        const currencyMenu = document.querySelector('[data-currency-menu]');
        if (!currencyMenu || !currencyMenu.contains(event.target as Node)) {
          setIsCurrencyOpen(false);
        }
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
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    
    if (files.length + imagePreviews.length > 10) {
      setErrors(prev => ({ ...prev, images: t('createListing.errors.imagesMax') }));
      return;
    }

    // Перевірка розміру файлів
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      setErrors(prev => ({ ...prev, images: t('createListing.errors.fileSizeExceeded') }));
      // Скидаємо input, щоб користувач міг вибрати інші файли
      e.target.value = '';
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
        price: isFree ? t('common.free') : price,
        currency: currency,
        isFree,
        category,
        subcategory: subcategory || null,
        condition: condition || null,
        location,
        status: status || 'active',
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
    <div className="fixed inset-0 bg-[#000000] flex flex-col overflow-hidden" style={{ zIndex: 9999, isolation: 'isolate' }}>
      <div className="bg-[#000000] w-full h-full flex flex-col relative">
        {/* Хедер */}
        <div className="bg-[#000000] border-b border-white/20 px-4 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-white">{t('listing.editListing')}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[#1C1C1C] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 space-y-4 overflow-y-auto flex-1 min-h-0 pb-32" style={{
          background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), #000000'
        }}>
          {/* Фото */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Фото * {imagePreviews.length}/10
            </label>
            <div className="grid grid-cols-3 gap-2">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-[#1C1C1C] border border-white/20">
                  <img 
                    src={(() => {
                      if (typeof preview === 'string') {
                        // Повні URL (http/https)
                        if (preview.startsWith('http')) return preview;
                        // Data URLs (base64 для нових фото)
                        if (preview.startsWith('data:')) return preview;
                        // Шляхи до файлів
                        const cleanPath = preview.split('?')[0];
                        const pathWithoutSlash = cleanPath?.startsWith('/') ? cleanPath.slice(1) : cleanPath;
                        return pathWithoutSlash ? `/api/images/${pathWithoutSlash}` : '';
                      }
                      return '';
                    })()}
                    alt={`Preview ${index + 1}`} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-white/40 text-xs">Помилка</div>';
                      }
                    }}
                  />
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
                <label className="aspect-square rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-[#D3F1A7] transition-colors">
                  <div className="text-center">
                    <Upload size={24} className="text-white/70 mx-auto mb-1" />
                    <span className="text-xs text-white/70">Додати</span>
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
              <p className="mt-1 text-sm text-red-400">{errors.images}</p>
            )}
          </div>

          {/* Заголовок */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
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
              className={`w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                errors.title ? 'border-red-500' : 'border-white/20'
              } focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]`}
              maxLength={100}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-400">{errors.title}</p>
            )}
          </div>

          {/* Опис */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
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
              className={`w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                errors.description ? 'border-red-500' : 'border-white/20'
              } focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7] resize-none`}
              maxLength={2000}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-400">{errors.description}</p>
            )}
          </div>

          {/* Ціна */}
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 text-[#D3F1A7] focus:ring-[#D3F1A7] bg-transparent"
                style={{ accentColor: '#D3F1A7' }}
              />
              <span className="text-sm font-medium text-white">{t('common.free')}</span>
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
                    placeholder="Ціна"
                    className={`flex-1 px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                      errors.price ? 'border-red-500' : 'border-white/20'
                    } focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]`}
                  />
                    <button
                    ref={currencyRef}
                      type="button"
                      onClick={() => {
                        setIsCurrencyOpen(!isCurrencyOpen);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 hover:border-white/40 transition-colors flex items-center gap-0.5 min-w-[80px] text-white"
                    >
                      <span className="font-medium">
                        {currency === 'UAH' ? '₴' : currency === 'EUR' ? '€' : '$'}
                      </span>
                      <ChevronDown size={16} className={`text-white/70 transition-transform ${isCurrencyOpen ? 'rotate-180' : ''} -mr-1`} />
                    </button>
                </div>
                {errors.price && (
                  <p className="mt-1 text-sm text-red-400">{errors.price}</p>
                )}
              </>
            )}
          </div>

          {/* Розділ */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
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
                className={`px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                  category === cat.id
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                    : errors.category
                    ? 'border-red-500 bg-[#1C1C1C] text-white'
                    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CategoryIcon categoryId={cat.id} isActive={category === cat.id} size={20} />
                    <span className="font-medium text-sm">{cat.name}</span>
                  </div>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="mt-1 text-sm text-red-400">{errors.category}</p>
            )}
          </div>

          {/* Тип */}
          {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white mb-3">
                Тип (необов'язково)
              </label>
              {(() => {
                // Для категорії "Послуги та робота" розділяємо підкатегорії на дві групи
                const isServicesWork = category === 'services_work';
                const workSubcategories = ['vacancies', 'part_time', 'looking_for_work', 'other_work'];
                
                const servicesSubcategories = isServicesWork 
                  ? selectedCategoryData.subcategories.filter(sub => !workSubcategories.includes(sub.id))
                  : selectedCategoryData.subcategories;
                const workSubcategoriesList = isServicesWork
                  ? selectedCategoryData.subcategories.filter(sub => workSubcategories.includes(sub.id))
                  : [];

                if (isServicesWork && workSubcategoriesList.length > 0) {
                  // Відображаємо в 2 ряди
                  return (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSubcategory('');
                            tg?.HapticFeedback.impactOccurred('light');
                          }}
                          className={`px-3 py-2 rounded-xl border-2 transition-all text-sm ${
                            !subcategory
                              ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                              : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                          }`}
                        >
                          Всі типи
                        </button>
                        {servicesSubcategories.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setSubcategory(sub.id);
                              tg?.HapticFeedback.impactOccurred('light');
                            }}
                            className={`px-4 py-2 rounded-xl border-2 transition-all ${
                              subcategory === sub.id
                                ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                                : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                            }`}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {workSubcategoriesList.map(sub => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setSubcategory(sub.id);
                              tg?.HapticFeedback.impactOccurred('light');
                            }}
                            className={`px-4 py-2 rounded-xl border-2 transition-all ${
                              subcategory === sub.id
                                ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                                : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                            }`}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                
                // Звичайне відображення в один ряд
                return (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSubcategory('');
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className={`px-3 py-2 rounded-xl border-2 transition-all text-sm ${
                        !subcategory
                          ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                          : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
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
                            ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                            : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                        }`}
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Стан */}
          <div className="relative" ref={conditionRef}>
            <label className="block text-sm font-medium text-white mb-2">
              Стан (необов'язково)
            </label>
            <button
              type="button"
              onClick={() => setIsConditionOpen(!isConditionOpen)}
              className="w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 flex items-center justify-between hover:border-white/40 transition-colors text-white"
            >
              <div className="flex items-center gap-2">
                {selectedCondition && (
                  <>
                    {selectedCondition.icon && <selectedCondition.icon size={20} className="text-[#D3F1A7]" />}
                    <span className="font-medium">{selectedCondition.label}</span>
                  </>
                )}
                {!selectedCondition && (
                  <span className="text-white/50">Оберіть стан</span>
                )}
              </div>
              <ChevronDown size={20} className={`text-white/70 transition-transform ${isConditionOpen ? 'rotate-180' : ''}`} />
            </button>
            {isConditionOpen && (
              <div className="absolute left-0 right-0 mt-2 bg-[#1C1C1C] border border-white/20 rounded-xl shadow-lg z-20">
                {conditionOptions.map(option => {
                  const IconComponent = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCondition(option.value);
                        setIsConditionOpen(false);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/10 transition-colors border-b border-white/10 last:border-b-0 text-white"
                    >
                      <div className="flex items-center gap-3">
                        <IconComponent size={20} className="text-[#D3F1A7]" />
                        <span>{option.label}</span>
                      </div>
                      {selectedCondition?.value === option.value && (
                        <span className="text-[#D3F1A7]">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Локація */}
          <div className="relative" ref={locationRef}>
            <label className="block text-sm font-medium text-white mb-2">
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Search') {
                    e.preventDefault();
                    const input = e.target as HTMLInputElement;
                    input.blur();
                    tg?.HapticFeedback.impactOccurred('light');
                  }
                }}
                onFocus={() => setIsLocationOpen(true)}
                placeholder="Оберіть або введіть місто"
                className={`w-full px-4 py-3 pl-12 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                  errors.location ? 'border-red-500' : 'border-white/20'
                } focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]`}
              />
              <MapPin 
                size={18} 
                className="absolute left-5 top-1/2 -translate-y-1/2 text-white/70"
              />
            </div>
            
            {isLocationOpen && filteredCities.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-[#1C1C1C] rounded-xl border border-white/20 shadow-lg max-h-60 overflow-y-auto">
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
                    className="w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2 text-white"
                  >
                    <MapPin size={16} className="text-white/70" />
                    <span>{city}</span>
                  </button>
                ))}
              </div>
            )}
            {errors.location && (
              <p className="mt-1 text-sm text-red-400">{errors.location}</p>
            )}
          </div>

          {/* Статус */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              {t('editListing.status') || 'Статус'}
            </label>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setStatus('active');
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  status === 'active'
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7] shadow-sm'
                    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <CheckCircle size={20} />
                <span>{t('editListing.active')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSoldConfirm(true);
                    tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  status === 'sold'
                    ? 'border-white/40 bg-white/10 text-white shadow-sm'
                    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <Tag size={20} />
                <span>{t('editListing.sold')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus('hidden');
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  status === 'hidden'
                    ? 'border-orange-500/70 bg-orange-500/20 text-orange-400 shadow-sm'
                    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/5'
                }`}
              >
                <EyeOff size={20} />
                <span>{t('sales.deactivated')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Кнопки - фіксовані знизу поверх головного меню */}
        <div className="bg-[#000000] border-t border-white/20 px-4 pt-4 pb-4 flex gap-2 safe-area-bottom shadow-lg" style={{ 
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', 
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 99999
        }}>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="px-4 py-3 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Trash2 size={16} />
            {t('common.delete')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-transparent border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-[#D3F1A7] text-black rounded-xl text-sm font-medium hover:bg-[#D3F1A7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('editListing.saving') : t('common.save')}
          </button>
        </div>

        {/* Backdrop для валюти */}
        {isCurrencyOpen && (
          <div 
            className="fixed inset-0 z-[9999]"
            onClick={() => setIsCurrencyOpen(false)}
          />
        )}

        {/* Меню валюти */}
        {isCurrencyOpen && (
          <div 
            data-currency-menu
            className="fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] min-w-[120px]"
            style={{
              top: `${currencyMenuPosition.top + 8}px`,
              left: `${currencyMenuPosition.left}px`,
              width: `${currencyMenuPosition.width || 120}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setCurrency('UAH');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b border-white/10 text-white ${
                currency === 'UAH' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'hover:bg-white/10'
              }`}
            >
              <span>₴ UAH</span>
              {currency === 'UAH' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
            </button>
                <button
              type="button"
              onClick={() => {
                setCurrency('EUR');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b border-white/10 text-white ${
                currency === 'EUR' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'hover:bg-white/10'
              }`}
            >
              <span>€ EUR</span>
              {currency === 'EUR' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
                </button>
                <button
              type="button"
              onClick={() => {
                setCurrency('USD');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 text-white ${
                currency === 'USD' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'hover:bg-white/10'
              }`}
            >
              <span>$ USD</span>
              {currency === 'USD' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
                </button>
          </div>
        )}

        {/* Підтвердження видалення */}
        <ConfirmModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title={t('editListing.deleteConfirmTitle')}
          message={t('editListing.confirmDelete')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-red-500 hover:bg-red-600"
          tg={tg}
        />

        {/* Підтвердження продажу */}
        <ConfirmModal
          isOpen={showSoldConfirm}
          onClose={() => setShowSoldConfirm(false)}
          onConfirm={() => {
            setStatus('sold');
            setShowSoldConfirm(false);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          title={t('editListing.markAsSold')}
          message={t('editListing.confirmMarkSold')}
          confirmText={t('editListing.markAsSold')}
          cancelText={t('common.cancel')}
          confirmButtonClass="bg-green-500 hover:bg-green-600"
          tg={tg}
        />
      </div>
    </div>
  );
};


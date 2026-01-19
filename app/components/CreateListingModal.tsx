import { X, Upload, Image as ImageIcon, ChevronDown, MapPin, Sparkles, Wrench } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Category } from '@/types';
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getCategories } from '@/constants/categories';
import { germanCities } from '@/constants/german-cities';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { CategoryIcon } from './CategoryIcon';
import Image from 'next/image';

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
  const { toast, showToast, hideToast } = useToast();
  const categories = getCategories(t);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'UAH' | 'EUR' | 'USD'>('EUR');
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
  const currencyRef = useRef<HTMLButtonElement>(null);
  const [currencyMenuPosition, setCurrencyMenuPosition] = useState({ top: 0, left: 0, width: 0 });

  // Ліміти для Telegram (caption до фото має ліміт 1024 символи)
  // Базовий текст (~120 символів): emoji, HTML теги, структура, ціна, категорія, локація, хештеги
  const TITLE_MAX_LENGTH = 100;
  const DESCRIPTION_MAX_LENGTH = 850; // Залишаємо місце для базового тексту та title
  const TELEGRAM_CAPTION_LIMIT = 1024;

  // Функція для розрахунку загальної довжини тексту оголошення (приблизна)
  const calculateTotalTextLength = useMemo(() => {
    const baseTextLength = 120; // Базовий текст з emoji та структурою
    const categoryText = subcategory ? `${category} / ${subcategory}` : category;
    const categoryLength = categoryText.length + 25; // "📂 <b>Категорія:</b> " + categoryText + "\n"
    const locationLength = (location?.length || 0) + 28; // "📍 <b>Розташування:</b> " + location + "\n\n"
    const priceLength = (price?.length || 0) + 25; // "💰 <b>Ціна:</b> " + price + " " + currency + "\n"
    const hashtagLength = category.replace(/\s+/g, '').length + 13; // "#Оголошення #" + category
    const titleHTMLTags = 0; // Можливо 7 символів для <b></b> якщо highlighted, але поки 0
    const titlePrefixLength = 2; // "📌 " або "⭐ "
    
    return baseTextLength + categoryLength + locationLength + priceLength + hashtagLength + title.length + titleHTMLTags + titlePrefixLength + description.length + 5; // +5 для "\n\n📄 \n\n"
  }, [title, description, price, currency, category, subcategory, location]);

  const selectedCategoryData = categories.find(cat => cat.id === category);

  const conditionOptions = [
    { value: 'new', label: t('listing.new'), icon: Sparkles },
    { value: 'used', label: t('listing.used'), icon: Wrench },
  ];

  const selectedCondition = conditionOptions.find(opt => opt.value === condition);

  // Автоматично встановлюємо isFree при виборі категорії "Безкоштовно"
  useEffect(() => {
    if (category === 'free') {
      setIsFree(true);
    } else if (category && category !== 'free') {
      // При виборі іншої категорії скидаємо isFree
      setIsFree(false);
    }
  }, [category]);

  // Автоматично встановлюємо категорію "free" при встановленні галочки "Безкоштовно"
  useEffect(() => {
    if (isFree && category !== 'free') {
      setCategory('free');
      setSubcategory('');
    } else if (!isFree && category === 'free') {
      // Якщо знято галочку і категорія була 'free', скидаємо категорію
      setCategory('');
      setSubcategory('');
    }
  }, [isFree]);

  // Список міст для вибору при створенні оголошення
  const defaultCities = [
    'Hamburg',
    'Norderstedt',
    'Pinneberg',
    'Wedel',
    'Ahrensburg',
    'Reinbek',
    'Barsbüttel',
    'Elmshorn',
    'Stade',
    'Buxtehude'
  ];

  // Фільтруємо міста за запитом (по ключових літерах, як на головній сторінці)
  const filteredCities = useMemo(() => {
    if (!locationQuery.trim()) {
      return defaultCities;
    }
    const query = locationQuery.toLowerCase().trim();
    // Спочатку шукаємо в defaultCities
    const defaultMatches = defaultCities.filter(city =>
      city.toLowerCase().startsWith(query) || city.toLowerCase().includes(query)
    );
    // Якщо знайдено в defaultCities, повертаємо їх
    if (defaultMatches.length > 0) {
      return defaultMatches;
    }
    // Якщо не знайдено, шукаємо в повному списку міст
    return germanCities.filter(city =>
      city.toLowerCase().startsWith(query) || city.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [locationQuery]);

  // Блокуємо скрол body при відкритому модальному вікні
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
    } else {
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
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  // Оновлюємо позицію меню валюти при відкритті
  useEffect(() => {
    if (isCurrencyOpen && currencyRef.current) {
      const rect = currencyRef.current.getBoundingClientRect();
      const menuWidth = Math.min(rect.width, window.innerWidth - 32); // Мінімум 16px відступ з обох сторін
      // Зсуваємо вліво на 30% від ширини кнопки
      const leftOffset = rect.width * 0.3;
      const left = Math.max(16, Math.min(rect.left - leftOffset, window.innerWidth - menuWidth - 16)); // Не виходити за межі екрану
      
      setCurrencyMenuPosition({
        top: rect.bottom,
        left: left,
        width: menuWidth
      });
    }
  }, [isCurrencyOpen]);

  // Закриваємо dropdown при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Перевіряємо, чи клік не на меню валюти
      const currencyMenu = document.getElementById('currency-filter-menu');
      if (currencyMenu && currencyMenu.contains(target)) {
        return; // Не закриваємо, якщо клік всередині меню
      }
      
      if (conditionRef.current && !conditionRef.current.contains(target)) {
        setIsConditionOpen(false);
      }
      if (currencyRef.current && !currencyRef.current.contains(target)) {
        setIsCurrencyOpen(false);
      }
    };

    // Не додаємо обробник якщо відкрите модальне вікно міста
    if (!isLocationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isLocationOpen]);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    
    if (files.length + images.length > 10) {
      if (tg) {
        tg.showAlert(t('createListing.maxPhotos'));
      } else {
        showToast(t('createListing.maxPhotos'), 'error');
      }
      return;
    }

    // Перевірка розміру файлів
    const oversizedFiles = files.filter(file => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const errorMessage = t('createListing.errors.fileSizeExceeded');
      if (tg) {
        tg.showAlert(errorMessage);
      } else {
        showToast(errorMessage, 'error');
      }
      // Скидаємо input, щоб користувач міг вибрати інші файли
      e.target.value = '';
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

    // Перевірка загальної довжини тексту для Telegram (1024 символи)
    if (calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT) {
      const excess = calculateTotalTextLength - TELEGRAM_CAPTION_LIMIT;
      newErrors.description = `Текст перевищує ліміт Telegram на ${excess} символів. Скоротіть заголовок або опис.`;
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
      
      // НЕ очищаємо форму і НЕ закриваємо модальне вікно
      // Це буде зроблено в CreateListingFlow після завершення всього потоку
    } catch (error) {
      console.error('Error creating listing:', error);
      if (tg) {
        tg.showAlert(t('createListing.errorCreating'));
      } else {
        showToast(t('createListing.errorCreating'), 'error');
      }
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden font-montserrat"
      style={{
        background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
      }}
    >
      <div className="w-full h-full flex flex-col">
        <div className="px-4 space-y-4 overflow-y-auto flex-1 min-h-0 pb-32">
          {/* Лого Trade Ground */}
          <div className="w-full pt-4 pb-3 flex items-center justify-center">
            <Image 
              src="/images/Group 1000007086.svg" 
              alt="Trade Ground" 
              width={204} 
              height={64.5}
              className="w-auto object-contain"
              style={{ height: '52.5px', width: 'auto' }}
              priority
            />
          </div>
          
          {/* Заголовок */}
          <div className="flex items-center justify-center px-4 pb-4">
            <h2 className="text-xl font-bold text-white">{t('createListing.title')}</h2>
          </div>
          {/* Фото */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              {t('createListing.photosLabel')}
            </label>
            {imagePreviews.length === 0 ? (
              <label className="w-full px-4 py-8 bg-transparent rounded-xl border-2 border-dashed border-white flex flex-col items-center justify-center cursor-pointer hover:border-white/70 transition-colors">
                <Upload size={32} className="text-white mb-2" />
                <span className="text-sm text-white">{t('createListing.photosLabel')?.replace(' *', '') || 'Додати фото'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="w-full px-4 py-3 bg-transparent rounded-xl">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-[#1C1C1C]">
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
                </div>
                {images.length < 10 && (
                  <label className="w-full px-4 py-4 bg-transparent rounded-xl border-2 border-dashed border-white flex items-center justify-center cursor-pointer hover:border-white/70 transition-colors">
                    <Upload size={20} className="text-white mr-2" />
                    <span className="text-sm text-white">{t('createListing.addMorePhotos')}</span>
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
            )}
          </div>

          {/* Заголовок */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-white">
                {t('createListing.titleLabel')}
              </label>
              <span className={`text-xs ${title.length > TITLE_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-white/50'}`}>
                {title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                if (e.target.value.length <= TITLE_MAX_LENGTH) {
                  setTitle(e.target.value);
                  if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
                }
              }}
              placeholder={t('createListing.titlePlaceholder')}
              className={`w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                errors.title ? 'border-red-500' : 'border-white/20'
              } focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50`}
              maxLength={TITLE_MAX_LENGTH}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-400">{errors.title}</p>
            )}
          </div>

          {/* Опис */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-white">
                {t('createListing.descriptionLabel')}
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT ? 'text-red-400' : calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT * 0.9 ? 'text-yellow-400' : 'text-white/50'}`}>
                  Загалом: {calculateTotalTextLength}/{TELEGRAM_CAPTION_LIMIT}
                </span>
                <span className={`text-xs ${description.length > DESCRIPTION_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-white/50'}`}>
                  Опис: {description.length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
            </div>
            <textarea
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= DESCRIPTION_MAX_LENGTH) {
                  setDescription(e.target.value);
                  if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
                }
              }}
              placeholder={t('createListing.descriptionPlaceholder')}
              rows={4}
              className={`w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                errors.description || calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT ? 'border-red-500' : 'border-white/20'
              } focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 resize-none`}
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-400">{errors.description}</p>
            )}
            {calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT && !errors.description && (
              <p className="mt-1 text-sm text-yellow-400">
                Загальний текст перевищує ліміт Telegram ({TELEGRAM_CAPTION_LIMIT} символів) на {calculateTotalTextLength - TELEGRAM_CAPTION_LIMIT} символів. Скоротіть заголовок або опис.
              </p>
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
                    placeholder={t('createListing.pricePlaceholder')}
                    className={`flex-1 px-4 py-3 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                      errors.price ? 'border-red-500' : 'border-white/20'
                    } focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50`}
                  />
                    <button
                    ref={currencyRef}
                      type="button"
                      onClick={() => {
                        setIsCurrencyOpen(!isCurrencyOpen);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className="px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 hover:border-white/50 transition-colors flex items-center gap-0.5 min-w-[80px]"
                    >
                      <span className="text-white font-medium">
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
                      ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                      : errors.category
                      ? 'border-red-500 bg-[#1C1C1C] text-white'
                      : 'border-white/20 text-white hover:border-white/40'
                  }`}
                  style={category !== cat.id && !errors.category ? {
                    background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
                  } : {}}
                >
                  <div className="flex items-center gap-2">
                    <CategoryIcon categoryId={cat.id} isActive={category === cat.id} size={24} />
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
                {t('createListing.subcategoryLabel')}
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
                          className={`px-4 py-2 rounded-xl border-2 transition-all ${
                            subcategory === ''
                              ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                              : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
                          }`}
                        >
                          {t('createListing.allTypes')}
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
                      className={`px-4 py-2 rounded-xl border-2 transition-all ${
                        subcategory === ''
                          ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 text-[#D3F1A7]'
                          : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40'
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
          <div ref={conditionRef} className="relative">
            <label className="block text-sm font-medium text-white mb-2">
              {t('createListing.conditionLabel')}
            </label>
            <button
              type="button"
              onClick={() => {
                setIsConditionOpen(!isConditionOpen);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-full px-4 py-3 bg-[#1C1C1C] rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 flex items-center justify-between hover:bg-[#1C1C1C]/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                {selectedCondition && (
                  <>
                    {selectedCondition.icon && (
                      <selectedCondition.icon size={20} className="text-white" />
                    )}
                    <span className="text-white font-medium">{selectedCondition.label}</span>
                  </>
                )}
                {!selectedCondition && (
                  <span className="text-white/50">{t('createListing.fields.selectCondition')}</span>
                )}
              </div>
              <ChevronDown 
                size={20} 
                className={`text-white/70 transition-transform ${isConditionOpen ? 'rotate-180' : ''}`}
              />
            </button>
            
            {isConditionOpen && (
              <div className="absolute z-50 w-full mt-2 bg-[#1C1C1C] rounded-xl border border-white/20 shadow-lg overflow-hidden">
                {conditionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setCondition(option.value);
                      setIsConditionOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors ${
                      condition === option.value ? 'bg-[#D3F1A7]/20 text-[#D3F1A7]' : 'text-white'
                    }`}
                  >
                    {option.icon && (
                      <option.icon 
                        size={20} 
                        className={condition === option.value ? 'text-[#D3F1A7]' : 'text-white'} 
                      />
                    )}
                    <span className="font-medium">{option.label}</span>
                    {condition === option.value && (
                      <span className="ml-auto text-[#D3F1A7]">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Локація */}
          <div ref={locationRef} className="relative">
            <label className="block text-sm font-medium text-white mb-2">
              {t('createListing.locationLabel')}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsLocationOpen(true);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full py-3 pr-10 bg-[#1C1C1C] rounded-xl border text-left ${
                  errors.location ? 'border-red-500' : 'border-white/20'
                } focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 hover:bg-[#1C1C1C]/80 transition-colors`}
                style={{ paddingLeft: '56px' }}
              >
              <MapPin 
                size={18} 
                className="absolute top-1/2 -translate-y-1/2 text-[#D3F1A7]"
                style={{ left: '20px' }}
              />
                <span className={location ? 'text-white font-medium' : 'text-white/50'}>
                  {location || t('createListing.locationPlaceholder')}
                </span>
              </button>
              {location && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocation('');
                    setLocationQuery('');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors z-10"
                >
                  <X size={14} className="text-white" />
                </button>
              )}
            </div>
            
            {errors.location && (
              <p className="mt-1 text-sm text-red-400">{errors.location}</p>
            )}
          </div>

          {errors.images && (
            <p className="mt-1 text-sm text-red-400">{errors.images}</p>
          )}
        </div>

        {/* Кнопки - фіксовані знизу поверх головного меню */}
        <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/20 px-4 pt-3 pb-3 flex gap-2 z-[80] safe-area-bottom" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))', bottom: '8px' }}>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-1.5 bg-transparent text-white rounded-xl text-base font-semibold border border-white hover:bg-white/10 transition-colors font-montserrat"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-1.5 bg-[#D3F1A7] text-black rounded-xl text-base font-semibold hover:bg-[#D3F1A7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-montserrat"
          >
            {loading ? t('createListing.creating') : t('createListing.title')}
          </button>
        </div>
        {/* Backdrop для валюти */}
        {isCurrencyOpen && (
          <div 
            className="fixed inset-0 z-[9999]"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.id === 'currency-filter-menu' || target.closest('#currency-filter-menu')) {
                return;
              }
              setIsCurrencyOpen(false);
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.id === 'currency-filter-menu' || target.closest('#currency-filter-menu')) {
                return;
              }
              setIsCurrencyOpen(false);
            }}
          />
        )}

        {/* Меню валюти */}
        {isCurrencyOpen && (
          <div 
            id="currency-filter-menu"
            className="fixed bg-[#1C1C1C] rounded-xl border border-white/20 shadow-2xl z-[10000] min-w-[120px]"
            style={{
              top: `${currencyMenuPosition.top + 8}px`,
              left: `${currencyMenuPosition.left}px`,
              width: `${currencyMenuPosition.width}px`
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrency('UAH');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b border-white/10 ${
                currency === 'UAH' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'text-white hover:bg-white/10'
              }`}
            >
              <span>₴ UAH</span>
              {currency === 'UAH' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrency('EUR');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b border-white/10 ${
                currency === 'EUR' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'text-white hover:bg-white/10'
              }`}
            >
              <span>€ EUR</span>
              {currency === 'EUR' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrency('USD');
                setIsCurrencyOpen(false);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 ${
                currency === 'USD' ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] font-semibold' : 'text-white hover:bg-white/10'
              }`}
            >
              <span>$ USD</span>
              {currency === 'USD' && <span className="ml-auto text-[#D3F1A7]">✓</span>}
            </button>
          </div>
        )}
      </div>

      {/* Toast сповіщення */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      {/* Повноекранне модальне вікно для вибору міста через Portal */}
      {isLocationOpen && typeof window !== 'undefined' && createPortal(
        <div 
          data-city-modal
          className="fixed inset-0 z-[10000] flex flex-col bg-black font-montserrat"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Хедер */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-4 border-b border-white/20 bg-black">
            <h3 className="text-lg font-bold text-white">{t('createListing.selectCity')}</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsLocationOpen(false);
                setLocationQuery('');
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Поле пошуку */}
          <div className="flex-shrink-0 px-4 py-3 bg-black border-b border-white/20">
            <div className="relative">
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Search') {
                    e.preventDefault();
                    const input = e.target as HTMLInputElement;
                    input.blur();
                    tg?.HapticFeedback.impactOccurred('light');
                  }
                }}
                placeholder={t('createListing.searchCity')}
                autoFocus
                className="w-full px-4 py-3 pl-12 pr-10 bg-[#1C1C1C] rounded-xl border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
              <MapPin 
                size={18} 
                className="absolute left-5 top-1/2 -translate-y-1/2 text-[#D3F1A7] pointer-events-none"
              />
              {locationQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setLocationQuery('');
                    tg?.HapticFeedback.impactOccurred('light');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors z-10"
                >
                  <X size={14} className="text-white" />
                </button>
              )}
            </div>
          </div>

          {/* Список міст */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {filteredCities.length > 0 ? (
              <div className="divide-y divide-white/10">
                {filteredCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLocation(city);
                      setLocationQuery('');
                      setIsLocationOpen(false);
                      if (errors.location) setErrors(prev => ({ ...prev, location: '' }));
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className="w-full px-4 py-4 text-left hover:bg-[#D3F1A7]/10 active:bg-[#D3F1A7]/20 transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#D3F1A7]/20 flex items-center justify-center flex-shrink-0">
                      <MapPin size={18} className="text-[#D3F1A7]" />
                    </div>
                    <span className="text-white font-medium text-base">{city}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-20 h-20 rounded-full bg-[#1C1C1C] flex items-center justify-center mb-4">
                  <MapPin size={32} className="text-white/50" />
                </div>
                <p className="text-white font-semibold text-lg mb-2">{t('createListing.noCitiesFound')}</p>
                <p className="text-white/50 text-sm text-center">{t('createListing.tryAnotherSearch')}</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


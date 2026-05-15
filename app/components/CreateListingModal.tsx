import { X, Upload, Image as ImageIcon, ChevronDown, MapPin, Sparkles, Wrench } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Category } from '@/types';
import { useState, useRef, useEffect, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { getCategories } from '@/constants/categories';
import { germanCities, fetchGermanCitiesFromAPI } from '@/constants/german-cities';
import { majorGermanCities } from '@/constants/major-german-cities';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { useToast } from '@/hooks/useToast';
import { Toast } from './Toast';
import { CategoryIcon } from './CategoryIcon';
import { FixedLogoHeader } from '@/components/FixedLogoHeader';

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
  const { t, language } = useLanguage();
  const { toast, showToast, hideToast } = useToast();
  const categories = getCategories(t);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'UAH' | 'EUR' | 'USD'>('EUR');
  const [isFree, setIsFree] = useState(false);
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [location, setLocation] = useState('');
  const [condition, setCondition] = useState<string>('new');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [touchStartIndex, setTouchStartIndex] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
  const [touchElementRect, setTouchElementRect] = useState<DOMRect | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const isDraggingRef = useRef(false);
  const [isConditionOpen, setIsConditionOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const conditionRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const [currencyMenuPosition, setCurrencyMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [formScrollParent, setFormScrollParent] = useState<HTMLDivElement | null>(null);

  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);

  const rootOverlayStyle = useMemo(
    () =>
      ({
        background: isLight
          ? 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(63,83,49,0.14) 0%, transparent 45%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(63,83,49,0.1) 0%, transparent 45%), #f3f4f6'
          : 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(200, 230, 160, 0.28) 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(200, 230, 160, 0.20) 0%, transparent 40%), #000000',
        touchAction: 'pan-y',
        position: 'fixed' as const,
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
      }) satisfies CSSProperties,
    [isLight]
  );

  const inField = `rounded-xl border ${
    isLight
      ? 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
      : 'bg-[#1C1C1C] border-white/20 text-white placeholder:text-white/50'
  } ${ac.formFocusRing}`;

  const chipIdle = isLight
    ? 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/5';

  const chipSmallIdle = isLight
    ? 'border-gray-200 bg-white text-gray-900 hover:border-gray-300 hover:bg-gray-50'
    : 'border-white/20 bg-[#1C1C1C] text-white hover:border-white/40 hover:bg-white/5';

  const panelSurface = isLight ? 'bg-white border-gray-200' : 'bg-[#1C1C1C] border-white/20';
  const rowHover = isLight ? 'hover:bg-gray-50' : 'hover:bg-white/10';
  const checkBorderIdle = isLight ? 'border-gray-400 bg-transparent' : 'border-white/40 bg-transparent';

  /** Нижня кнопка «Створити оголошення»: у темній темі — світло-зелений акцент */
  const createPrimaryCtaClass = isLight
    ? 'bg-[#3F5331] text-white hover:bg-[#344728]'
    : 'bg-[#C8E6A0] text-[#0f1408] shadow-[0_0_22px_rgba(200,230,160,0.48)] hover:bg-[#dff5c0] hover:shadow-[0_0_28px_rgba(200,230,160,0.58)]';

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

  // Список міст для вибору при створенні оголошення —
  // використовуємо той же топ крупних міст, що й у фільтрі каталогу.
  const defaultCities = majorGermanCities;

  // Фільтруємо міста за запитом (по ключових літерах, як на головній сторінці)
  const [filteredCities, setFilteredCities] = useState<string[]>(defaultCities);
  const [loadingCities, setLoadingCities] = useState(false);

  // Загружаємо міста з API при зміні запиту
  useEffect(() => {
    const loadCities = async () => {
      if (!locationQuery.trim()) {
        setFilteredCities(defaultCities);
        return;
      }

      setLoadingCities(true);
      try {
        const result = await fetchGermanCitiesFromAPI(locationQuery, 30);
        // API вже відсортував результати і додав введений текст першим (якщо потрібно)
        // Зберігаємо порядок з API, додаючи defaultCities тільки якщо їх немає в результатах
        const resultCitiesLower = new Set(result.cities.map(c => c.toLowerCase()));
        const allCities: string[] = [];
        
        // Додаємо результати з API (вони вже в правильному порядку)
        allCities.push(...result.cities);
        
        // Додаємо defaultCities які не знайдені в результатах
        defaultCities.forEach(city => {
          if (!resultCitiesLower.has(city.toLowerCase())) {
            allCities.push(city);
          }
        });
        
        setFilteredCities(allCities.slice(0, 30));
      } catch (error) {
        console.error('Error loading cities:', error);
        // Fallback на локальний пошук
        const query = locationQuery.toLowerCase().trim();
        const queryTrimmed = locationQuery.trim();
        const exactMatches: string[] = [];
        const startsWith: string[] = [];
        const includes: string[] = [];
        
        // Пошук серед defaultCities
        defaultCities.forEach(city => {
          const cityLower = city.toLowerCase();
          if (cityLower === query) {
            exactMatches.push(city);
          } else if (cityLower.startsWith(query)) {
            startsWith.push(city);
          } else if (cityLower.includes(query)) {
            includes.push(city);
          }
        });
        
        // Пошук серед germanCities якщо не знайдено в defaultCities
        if (exactMatches.length === 0 && startsWith.length === 0 && includes.length === 0) {
          germanCities.forEach(city => {
            const cityLower = city.toLowerCase();
            if (cityLower === query) {
              exactMatches.push(city);
            } else if (cityLower.startsWith(query)) {
              startsWith.push(city);
            } else if (cityLower.includes(query)) {
              includes.push(city);
            }
          });
        }
        
        const allResults = [...exactMatches, ...startsWith, ...includes];
        
        // Додаємо введений текст першим, якщо він не точно збігається
        const hasExactMatch = allResults.some(city => city.toLowerCase() === query);
        if (!hasExactMatch && queryTrimmed) {
          allResults.unshift(queryTrimmed);
        }
        
        setFilteredCities(allResults.slice(0, 20));
      } finally {
        setLoadingCities(false);
      }
    };

    // Debounce запиту
    const timeoutId = setTimeout(() => {
      loadCities();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [locationQuery]);

  // Відстежуємо фокус на полях введення для приховування кнопок
  useEffect(() => {
    if (!isOpen) return;

    let focusTimeout: NodeJS.Timeout | null = null;
    let blurTimeout: NodeJS.Timeout | null = null;

    const handleFocusIn = (e: FocusEvent) => {
      // Скасовуємо попередній blur timeout якщо він є
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        // Миттєво приховуємо кнопки
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Скасовуємо попередній focus timeout якщо він є
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }

      // Невелика затримка, щоб переконатися, що фокус дійсно втрачено
      blurTimeout = setTimeout(() => {
        const activeElement = document.activeElement;
        if (
          !activeElement ||
          (activeElement instanceof HTMLElement &&
           activeElement.tagName !== 'INPUT' &&
           activeElement.tagName !== 'TEXTAREA' &&
           !activeElement.isContentEditable)
        ) {
          setIsInputFocused(false);
        }
      }, 150);
    };

    // Відстежуємо зміни висоти viewport (відкриття/закриття клавіатури)
    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const keyboardOpen = viewportHeight < windowHeight * 0.75;
        
        // Миттєво оновлюємо стан
        if (keyboardOpen) {
          setIsInputFocused(true);
        } else {
          // Перевіряємо, чи дійсно немає фокусу перед приховуванням
          const activeElement = document.activeElement;
          if (
            !activeElement ||
            (activeElement instanceof HTMLElement &&
             activeElement.tagName !== 'INPUT' &&
             activeElement.tagName !== 'TEXTAREA' &&
             !activeElement.isContentEditable)
          ) {
            setIsInputFocused(false);
          }
        }
      }
    };

    // Перевіряємо початковий стан
    const checkInitialState = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === 'INPUT' ||
         activeElement.tagName === 'TEXTAREA' ||
         activeElement.isContentEditable)
      ) {
        setIsInputFocused(true);
      }
    };

    // Перевіряємо початковий стан
    checkInitialState();

    document.addEventListener('focusin', handleFocusIn, true); // Використовуємо capture phase
    document.addEventListener('focusout', handleFocusOut, true);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
    }

    return () => {
      if (focusTimeout) clearTimeout(focusTimeout);
      if (blurTimeout) clearTimeout(blurTimeout);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
      }
    };
  }, [isOpen]);

  // Фіксуємо позицію кнопок, щоб вони не підтягувалися при відкритті клавіатури
  useEffect(() => {
    if (!isOpen || !buttonsRef.current) return;

    const buttonsElement = buttonsRef.current;
    
    const fixButtonsPosition = () => {
      if (buttonsElement) {
        requestAnimationFrame(() => {
          if (buttonsElement) {
            buttonsElement.style.position = 'fixed';
            buttonsElement.style.bottom = '0';
            buttonsElement.style.left = '0';
            buttonsElement.style.right = '0';
            // Фіксуємо transform в залежності від стану
            const transformValue = isInputFocused ? 'translateY(100%)' : 'translateY(0)';
            buttonsElement.style.transform = transformValue;
            buttonsElement.style.setProperty('-webkit-transform', transformValue);
          }
        });
      }
    };

    fixButtonsPosition();

    // Обробляємо зміни viewport
    const handleResize = () => {
      if (!isInputFocused) {
        fixButtonsPosition();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, isInputFocused]);

  // Блокуємо скрол body при відкритому модальному вікні (оптимізовано для плавності)
  useEffect(() => {
    if (isOpen) {
      // Використовуємо requestAnimationFrame для плавної зміни
      const scrollY = window.scrollY;
      // Зберігаємо scrollY в data-атрибуті для подальшого відновлення
      document.body.setAttribute('data-scroll-y', scrollY.toString());
      
      requestAnimationFrame(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.documentElement.style.overflow = 'hidden';
      });
    } else {
      // Плавне відновлення
      const savedScrollY = document.body.getAttribute('data-scroll-y');
      
      requestAnimationFrame(() => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.documentElement.style.overflow = '';
        document.body.removeAttribute('data-scroll-y');
        
        // Відновлюємо позицію без стрибків
        if (savedScrollY) {
          const scrollPosition = parseInt(savedScrollY, 10);
          // Використовуємо requestAnimationFrame для плавного скролу
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollPosition);
          });
        }
      });
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.documentElement.style.overflow = '';
      document.body.removeAttribute('data-scroll-y');
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

  // Функція для стискання зображень на клієнті
  const compressImageOnClient = async (file: File, maxSizeMB: number = 2): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = document.createElement('img');
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;
          
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            if (width > height) {
              height = (height / width) * MAX_WIDTH;
              width = MAX_WIDTH;
            } else {
              width = (width / height) * MAX_HEIGHT;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          let quality = 0.8;
          const estimatedSize = (width * height * 4) / 1024 / 1024;
          
          if (estimatedSize > maxSizeMB) {
            quality = Math.max(0.5, maxSizeMB / estimatedSize * 0.8);
          }
          
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }
              
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              
              console.log(`[compressImageOnClient] Original: ${(file.size / 1024 / 1024).toFixed(2)}MB, Compressed: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ
    const MAX_PHOTOS = 10;
    
    // Якщо вже досягнуто ліміт, не приймаємо нові фото
    if (images.length >= MAX_PHOTOS) {
      showToast(t('createListing.maxPhotos'), 'error');
      e.target.value = '';
      return;
    }

    // Обчислюємо скільки фото можна додати
    const availableSlots = MAX_PHOTOS - images.length;
    let filesToAdd = files.slice(0, availableSlots);
    const rejectedCount = files.length - filesToAdd.length;

    // Якщо є файли, які не вмістилися, показуємо уведомлення
    if (rejectedCount > 0) {
      showToast(t('createListing.maxPhotos'), 'error');
    }

    // Якщо немає файлів для додавання, скидаємо input
    if (filesToAdd.length === 0) {
      e.target.value = '';
      return;
    }

    // Стискаємо зображення перед додаванням
    const compressedFiles: File[] = [];
    for (const file of filesToAdd) {
      try {
        // Якщо файл більше 2MB, стискаємо
        if (file.size > 2 * 1024 * 1024) {
          console.log('[CreateListingModal] Compressing image:', file.name);
          const compressed = await compressImageOnClient(file, 2);
          compressedFiles.push(compressed);
        } else {
          compressedFiles.push(file);
        }
      } catch (error) {
        console.error('[CreateListingModal] Failed to compress image, using original:', error);
        compressedFiles.push(file);
      }
    }

    // Додаємо стиснуті файли
    const newImages = [...images, ...compressedFiles];
    setImages(newImages);

    // Створюємо прев'ю для всіх файлів одночасно
    const previewPromises = compressedFiles.map((file: File) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previewPromises).then(previews => {
      setImagePreviews(prev => [...prev, ...previews]);
    });

    // Скидаємо input для наступного вибору
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setImages(prev => {
      const newImages = [...prev];
      const [removed] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, removed);
      return newImages;
    });
    setImagePreviews(prev => {
      const newPreviews = [...prev];
      const [removed] = newPreviews.splice(fromIndex, 1);
      newPreviews.splice(toIndex, 0, removed);
      return newPreviews;
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    moveImage(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Touch handlers для мобильных устройств
  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    // Не начинаем drag если кликнули на кнопку удаления
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    
    // Предотвращаем выделение текста и стандартное поведение
    e.preventDefault();
    e.stopPropagation();
    
    isDraggingRef.current = true;
    
    // Получаем позицию элемента для визуального эффекта
    const element = e.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    setTouchElementRect(rect);
    
    // Предотвращаем выделение текста через глобальный обработчик
    const preventSelection = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('selectstart', preventSelection);
    
    // Предотвращаем закрытие приложения при свайпе вниз
    const preventPullToClose = (e: TouchEvent) => {
      if (isDraggingRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    document.addEventListener('touchmove', preventPullToClose, { passive: false });
    
    // Удаляем обработчики после завершения touch
    const cleanup = () => {
      isDraggingRef.current = false;
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('touchmove', preventPullToClose);
      document.removeEventListener('touchend', cleanup);
      document.removeEventListener('touchcancel', cleanup);
    };
    document.addEventListener('touchend', cleanup, { once: true });
    document.addEventListener('touchcancel', cleanup, { once: true });
    
    const touch = e.touches[0];
    setTouchStartIndex(index);
    setTouchStartY(touch.clientY);
    setTouchPosition({ x: touch.clientX, y: touch.clientY });
    setDraggedIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartIndex === null || touchStartY === null || touchElementRect === null) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    
    // Обновляем позицию для визуального эффекта (следует за пальцем)
    setTouchPosition({ x: currentX, y: currentY });
    
    // Получаем центр перетаскиваемого элемента
    const draggedCenterX = currentX;
    const draggedCenterY = currentY;
    
    // Проверяем все фото элементы
    const allPhotoElements = document.querySelectorAll('[data-photo-index]');
    let targetIndex: number | null = null;
    
    for (const photoElement of allPhotoElements) {
      const indexAttr = photoElement.getAttribute('data-photo-index');
      if (!indexAttr) continue;
      
      const elementIndex = parseInt(indexAttr, 10);
      
      // Пропускаем само перетаскиваемое фото
      if (elementIndex === touchStartIndex) continue;
      
      // Получаем позицию и размер элемента
      const rect = photoElement.getBoundingClientRect();
      
      // Вычисляем центр элемента
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;
      
      // Вычисляем расстояние от центра перетаскиваемого элемента до центра текущего элемента
      const distanceX = Math.abs(draggedCenterX - elementCenterX);
      const distanceY = Math.abs(draggedCenterY - elementCenterY);
      
      // Проверяем 90% площади
      const thresholdX = rect.width * 0.45;
      const thresholdY = rect.height * 0.45;
      
      if (distanceX <= thresholdX && distanceY <= thresholdY) {
        targetIndex = elementIndex;
        break;
      }
    }
    
    // Обновляем hoveredIndex для визуальной подсказки
    setHoveredIndex(targetIndex);
    
    // Если фото перетащено на 90% другого фото, "приземляем" его
    if (targetIndex !== null && touchStartIndex !== targetIndex && !isLocked) {
      // Блокируем дальнейшие перемещения
      setIsLocked(true);
      
      // Выполняем перемещение
      moveImage(touchStartIndex, targetIndex);
      
      // Плавно фиксируем фото на новом месте
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const newPhotoElement = document.querySelector(`[data-photo-index="${targetIndex}"]`) as HTMLElement;
          if (newPhotoElement) {
            const newRect = newPhotoElement.getBoundingClientRect();
            // Фиксируем на новом месте
            setTouchElementRect(newRect);
            setTouchPosition({ x: newRect.left + newRect.width / 2, y: newRect.top + newRect.height / 2 });
          }
          setTouchStartIndex(targetIndex);
          setDraggedIndex(targetIndex);
          
          // Разблокируем через небольшую задержку для плавности
          setTimeout(() => setIsLocked(false), 250);
        });
      });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    
    // Даем время для завершения анимации перед сбросом состояния
    setTimeout(() => {
      setTouchStartIndex(null);
      setTouchStartY(null);
      setDraggedIndex(null);
      setTouchPosition(null);
      setTouchElementRect(null);
      setHoveredIndex(null);
      setIsLocked(false);
    }, 100);
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

    if (!isFree && !isNegotiable) {
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
      showToast(t('createListing.fillAllFields'), 'error');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return;
    }

    setLoading(true);
    try {
      await onSave({
        title,
        description,
        price: isFree ? t('common.free') : (isNegotiable ? t('common.negotiable') : price),
        currency: currency,
        isFree,
        isNegotiable,
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
      showToast(t('createListing.errorCreating'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden font-montserrat"
      style={rootOverlayStyle}
      onTouchMove={(e) => {
        // Предотвращаем закрытие приложения во время перетаскивания
        if (isDraggingRef.current) {
          e.preventDefault();
        }
      }}
    >
      <div className="w-full h-full flex flex-col min-h-0">
        <FixedLogoHeader
          mode="sticky"
          scrollParent={formScrollParent}
          paddingX={false}
          zClassName="z-[60] shrink-0"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = `/${language}/bazaar`;
            }
          }}
        />
        <div
          ref={setFormScrollParent}
          className="px-4 space-y-4 overflow-y-auto flex-1 min-h-0 pb-32 max-lg:pt-2 lg:pt-4"
          style={{ paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Заголовок */}
          <div className="flex items-center justify-center px-4 pb-2 max-lg:pb-3">
            <h2 className={`text-xl font-bold ${ac.pageHeading}`}>{t('createListing.title')}</h2>
          </div>
          {/* Фото */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${ac.pageHeading}`}>
              {t('createListing.photosLabel')}
            </label>
            {/* Прогрес-бар стиснення зображень */}
            {imagePreviews.length === 0 ? (
              <label
                className={`w-full px-4 py-8 bg-transparent rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
                  isLight
                    ? 'border-gray-300 hover:border-gray-400'
                    : 'border-white hover:border-white/70'
                }`}
              >
                <Upload size={32} className={`mb-2 ${isLight ? 'text-gray-600' : 'text-white'}`} />
                <span className={`text-sm ${isLight ? 'text-gray-800' : 'text-white'}`}>
                  {t('createListing.photosLabel')?.replace(' *', '') || 'Додати фото'}
                </span>
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
                <div className="grid grid-cols-3 gap-2 mb-2 relative">
                  {imagePreviews.map((preview, index) => {
                    const isDragging = draggedIndex === index && touchPosition !== null && touchElementRect !== null && !isLocked;
                    const isHovered = hoveredIndex === index && draggedIndex !== index;
                    const isSnapping = isLocked && draggedIndex === index;
                    
                    // Вычисляем позицию для перетаскиваемого элемента
                    let dragTransform = '';
                    let dragScale = 1;
                    
                    if (isDragging && touchPosition && touchElementRect && !isLocked) {
                      // Вычисляем смещение от начальной позиции элемента
                      const offsetX = touchPosition.x - (touchElementRect.left + touchElementRect.width / 2);
                      const offsetY = touchPosition.y - (touchElementRect.top + touchElementRect.height / 2);
                      dragScale = 1.08;
                      dragTransform = `translate(${offsetX}px, ${offsetY}px) scale(${dragScale})`;
                    } else if (isSnapping) {
                      // Когда фото зафиксировано, плавно возвращаем его на место с небольшим "bounce"
                      dragTransform = 'translate(0px, 0px) scale(1.02)';
                    }
                    
                    return (
                      <div
                        key={`${index}-${preview.substring(0, 20)}`}
                        data-photo-index={index}
                        className={`relative aspect-square rounded-xl overflow-hidden border cursor-move select-none ${
                          isLight ? 'bg-gray-100' : 'bg-[#1C1C1C]'
                        } ${
                          isDragging ? (isLight ? 'opacity-95 z-50 shadow-2xl border-[#3F5331]/50' : 'opacity-95 z-50 shadow-2xl border-[#C8E6A0]/65') :
                          isHovered
                            ? ac.formPhotoActiveRing
                            :
                          isSnapping ? (isLight ? 'border-[#3F5331]/40' : 'border-[#C8E6A0]/50') :
                          isLight ? 'border-gray-200' : 'border-white/20'
                        }`}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ 
                          touchAction: 'none', 
                          userSelect: 'none', 
                          WebkitUserSelect: 'none',
                          transform: dragTransform || undefined,
                          transition: isDragging && !isLocked
                            ? 'box-shadow 0.15s ease-out, border-color 0.15s ease-out' 
                            : isSnapping
                            ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out, border-color 0.25s ease-out, box-shadow 0.25s ease-out'
                            : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out, border-color 0.2s ease-out',
                          willChange: isDragging ? 'transform' : 'auto'
                        }}
                      >
                        <img 
                          src={preview} 
                          alt={`Preview ${index + 1}`} 
                          className="w-full h-full object-cover pointer-events-none"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(index);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70 transition-colors z-10"
                        >
                          <X size={14} className="text-white" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {images.length < 10 && (
                  <label
                    className={`w-full px-4 py-4 bg-transparent rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                      isLight
                        ? 'border-gray-300 hover:border-gray-400'
                        : 'border-white hover:border-white/70'
                    }`}
                  >
                    <Upload size={20} className={`mr-2 ${isLight ? 'text-gray-600' : 'text-white'}`} />
                    <span className={`text-sm ${isLight ? 'text-gray-800' : 'text-white'}`}>{t('createListing.addMorePhotos')}</span>
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
            <div className="mb-2">
              <label className={`block text-sm font-medium ${ac.pageHeading}`}>
                {t('createListing.titleLabel')}
              </label>
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
              className={`w-full px-4 py-3 ${inField} ${
                errors.title ? 'border-red-500' : ''
              }`}
              maxLength={TITLE_MAX_LENGTH}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-400">{errors.title}</p>
            )}
          </div>

          {/* Опис */}
          <div>
            <div className="mb-2">
              <label className={`block text-sm font-medium ${ac.pageHeading}`}>
                {t('createListing.descriptionLabel')}
              </label>
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
              className={`w-full px-4 py-3 resize-none ${inField} ${
                errors.description || calculateTotalTextLength > TELEGRAM_CAPTION_LIMIT ? 'border-red-500' : ''
              }`}
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
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => {
                  setIsFree(!isFree);
                  if (!isFree) {
                    setIsNegotiable(false);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  isFree
                    ? ac.formChipSelected
                    : chipIdle
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  isFree
                    ? ac.formCheckboxFilled
                    : checkBorderIdle
                }`}>
                  {isFree && (
                    <svg className={`w-3 h-3 ${isLight ? 'text-white' : 'text-[#0f1408]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span>{t('common.free')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNegotiable(!isNegotiable);
                  if (!isNegotiable) {
                    setIsFree(false);
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  isNegotiable
                    ? ac.formChipSelected
                    : chipIdle
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  isNegotiable
                    ? ac.formCheckboxFilled
                    : checkBorderIdle
                }`}>
                  {isNegotiable && (
                    <svg className={`w-3 h-3 ${isLight ? 'text-white' : 'text-[#0f1408]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span>{t('common.negotiable')}</span>
              </button>
            </div>
            {!isFree && !isNegotiable && (
              <>
                <div className="flex gap-2 items-center mb-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    value={price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(',', '.');
                      let numeric = raw.replace(/[^0-9.]/g, '');
                      const parts = numeric.split('.');
                      if (parts.length > 2) numeric = parts[0] + '.' + parts.slice(1).join('');
                      setPrice(numeric);
                      if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
                    }}
                    placeholder={t('createListing.pricePlaceholder')}
                    className={`flex-1 px-4 py-3 ${inField} ${
                      errors.price ? 'border-red-500' : ''
                    }`}
                  />
                    <button
                    ref={currencyRef}
                      type="button"
                      onClick={() => {
                        setIsCurrencyOpen(!isCurrencyOpen);
                        tg?.HapticFeedback.impactOccurred('light');
                      }}
                      className={`px-4 py-3 rounded-xl border transition-colors flex items-center gap-0.5 min-w-[80px] ${inField} ${
                        isLight ? 'hover:border-gray-400' : 'hover:border-white/50'
                      }`}
                    >
                      <span className={`font-medium ${ac.pageHeading}`}>
                        {currency === 'UAH' ? '₴' : currency === 'EUR' ? '€' : '$'}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${isCurrencyOpen ? 'rotate-180' : ''} -mr-1 ${
                          isLight ? 'text-gray-500' : 'text-white/70'
                        }`}
                      />
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
            <label className={`block text-sm font-medium mb-3 ${ac.pageHeading}`}>
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
                      ? ac.formChipSelected
                      : errors.category
                      ? `border-red-500 ${isLight ? 'bg-white text-gray-900' : 'bg-[#1C1C1C] text-white'}`
                      : chipIdle
                  }`}
                  style={
                    category !== cat.id && !errors.category && !isLight
                      ? {
                          background:
                            'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(200, 230, 160, 0.26) 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(200, 230, 160, 0.18) 0%, transparent 40%), #000000',
                        }
                      : {}
                  }
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
              <label className={`block text-sm font-medium mb-3 ${ac.pageHeading}`}>
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
                              ? ac.formChipSelected
                              : chipSmallIdle
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
                                ? ac.formChipSelected
                                : chipSmallIdle
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
                                ? ac.formChipSelected
                                : chipSmallIdle
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
                          ? ac.formChipSelected
                          : chipSmallIdle
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
                            ? ac.formChipSelected
                            : chipSmallIdle
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
            <label className={`block text-sm font-medium mb-2 ${ac.pageHeading}`}>
              {t('createListing.conditionLabel')}
            </label>
            <button
              type="button"
              onClick={() => {
                setIsConditionOpen(!isConditionOpen);
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-full px-4 py-3 rounded-xl border flex items-center justify-between transition-colors ${inField} ${
                isLight ? 'hover:bg-gray-50' : 'hover:bg-[#1C1C1C]/80'
              }`}
            >
              <div className="flex items-center gap-2">
                {selectedCondition && (
                  <>
                    {selectedCondition.icon && (
                      <selectedCondition.icon size={20} className={ac.pageHeading} />
                    )}
                    <span className={`font-medium ${ac.pageHeading}`}>{selectedCondition.label}</span>
                  </>
                )}
                {!selectedCondition && (
                  <span className={ac.mutedText}>{t('createListing.fields.selectCondition')}</span>
                )}
              </div>
              <ChevronDown 
                size={20} 
                className={`transition-transform ${isConditionOpen ? 'rotate-180' : ''} ${
                  isLight ? 'text-gray-500' : 'text-white/70'
                }`}
              />
            </button>
            
            {isConditionOpen && (
              <div className={`absolute z-50 w-full mt-2 rounded-xl border shadow-lg overflow-hidden ${panelSurface}`}>
                {conditionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setCondition(option.value);
                      setIsConditionOpen(false);
                      tg?.HapticFeedback.impactOccurred('light');
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${rowHover} ${
                      condition === option.value ? ac.formMenuRowSelected : ac.pageHeading
                    }`}
                  >
                    {option.icon && (
                      <option.icon 
                        size={20} 
                        className={condition === option.value ? ac.formAccentFg : ac.pageHeading} 
                      />
                    )}
                    <span className="font-medium">{option.label}</span>
                    {condition === option.value && (
                      <span className={`ml-auto ${ac.formAccentFg}`}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Локація */}
          <div ref={locationRef} className="relative">
            <label className={`block text-sm font-medium mb-2 ${ac.pageHeading}`}>
              {t('createListing.locationLabel')}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsLocationOpen(true);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full py-3 pr-10 rounded-xl border text-left transition-colors ${inField} ${
                  errors.location ? 'border-red-500' : ''
                } ${isLight ? 'hover:bg-gray-50' : 'hover:bg-[#1C1C1C]/80'}`}
                style={{ paddingLeft: '52px' }}
              >
              <MapPin 
                size={18} 
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${ac.formAccentFg}`}
                style={{ left: '16px' }}
              />
                <span className={location ? `font-medium ${ac.pageHeading}` : ac.mutedText}>
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
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10 ${
                    isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <X size={14} className={isLight ? 'text-gray-800' : 'text-white'} />
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
        <div 
          ref={buttonsRef}
          className={`fixed bottom-0 left-0 right-0 border-t px-4 pt-3 pb-3 flex gap-2 z-[80] safe-area-bottom transition-transform duration-200 ease-in-out ${
            isLight ? 'bg-white border-gray-200' : 'bg-black border-white/20'
          }`} 
          style={{ 
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))', 
            bottom: 0,
            position: 'fixed',
            left: 0,
            right: 0,
            transform: isInputFocused ? 'translateY(100%)' : 'translateY(0)',
            visibility: isInputFocused ? 'hidden' : 'visible',
            opacity: isInputFocused ? 0 : 1,
            pointerEvents: isInputFocused ? 'none' : 'auto',
            // Додаткова фіксація для запобігання підтягуванню
            willChange: 'transform'
          } as React.CSSProperties}
        >
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-1.5 bg-transparent rounded-xl text-base font-semibold border transition-colors font-montserrat ${
              isLight
                ? 'border-gray-300 text-gray-900 hover:bg-gray-100'
                : 'border-white text-white hover:bg-white/10'
            }`}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`flex-1 rounded-xl px-4 py-1.5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 font-montserrat ${createPrimaryCtaClass}`}
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
            className={`fixed rounded-xl border shadow-2xl z-[10000] min-w-[120px] ${panelSurface}`}
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
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b ${
                isLight ? 'border-gray-100' : 'border-white/10'
              } ${
                currency === 'UAH' ? ac.formMenuRowSelected : `${ac.pageHeading} ${rowHover}`
              }`}
            >
              <span>₴ UAH</span>
              {currency === 'UAH' && <span className={`ml-auto ${ac.formAccentFg}`}>✓</span>}
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
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-2 border-b ${
                isLight ? 'border-gray-100' : 'border-white/10'
              } ${
                currency === 'EUR' ? ac.formMenuRowSelected : `${ac.pageHeading} ${rowHover}`
              }`}
            >
              <span>€ EUR</span>
              {currency === 'EUR' && <span className={`ml-auto ${ac.formAccentFg}`}>✓</span>}
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
                currency === 'USD' ? ac.formMenuRowSelected : `${ac.pageHeading} ${rowHover}`
              }`}
            >
              <span>$ USD</span>
              {currency === 'USD' && <span className={`ml-auto ${ac.formAccentFg}`}>✓</span>}
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
          className={`fixed inset-0 z-[10000] flex flex-col font-montserrat ${
            isLight ? 'bg-gray-50' : 'bg-black'
          }`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Хедер */}
          <div
            className={`flex-shrink-0 flex items-center justify-between px-4 py-4 border-b ${
              isLight ? 'border-gray-200 bg-white' : 'border-white/20 bg-black'
            }`}
          >
            <h3 className={`text-lg font-bold ${ac.pageHeading}`}>{t('createListing.selectCity')}</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsLocationOpen(false);
                setLocationQuery('');
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                isLight ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <X size={20} className={isLight ? 'text-gray-800' : 'text-white'} />
            </button>
          </div>

          {/* Поле пошуку */}
          <div
            className={`flex-shrink-0 px-4 py-3 border-b ${
              isLight ? 'bg-white border-gray-200' : 'bg-black border-white/20'
            }`}
          >
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
                className={`w-full px-4 py-3 pl-10 pr-10 rounded-xl border ${inField}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
              <MapPin 
                size={18} 
                className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${ac.formAccentFg}`}
                style={{ left: '12px' }}
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
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10 ${
                    isLight ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  <X size={14} className={isLight ? 'text-gray-800' : 'text-white'} />
                </button>
              )}
            </div>
          </div>

          {/* Список міст */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            {loadingCities ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className={`w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-4 ${isLight ? 'border-[#3F5331]' : 'border-[#C8E6A0]'}`}></div>
                <p className={`text-sm ${ac.mutedText}`}>{t('common.loading')}</p>
              </div>
            ) : filteredCities.length > 0 ? (
              <div className={isLight ? 'divide-y divide-gray-100' : 'divide-y divide-white/10'}>
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
                    className={`w-full px-4 py-4 text-left transition-colors flex items-center gap-3 ${
                      isLight ? 'hover:bg-gray-100 active:bg-[#3F5331]/15' : 'hover:bg-white/[0.06] active:bg-[#C8E6A0]/12'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isLight ? 'bg-[#3F5331]/20' : 'bg-[#C8E6A0]/12'}`}>
                      <MapPin size={18} className={ac.formAccentFg} />
                    </div>
                    <span className={`font-medium text-base ${ac.pageHeading}`}>{city}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                    isLight ? 'bg-gray-200' : 'bg-[#1C1C1C]'
                  }`}
                >
                  <MapPin size={32} className={isLight ? 'text-gray-400' : 'text-white/50'} />
                </div>
                <p className={`font-semibold text-lg mb-2 ${ac.pageHeading}`}>{t('createListing.noCitiesFound')}</p>
                <p className={`text-sm text-center ${ac.mutedText}`}>{t('createListing.tryAnotherSearch')}</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


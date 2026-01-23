import { X, Upload, Image as ImageIcon, ChevronDown, MapPin, Trash2, Sparkles, Wrench, CheckCircle, Tag, EyeOff } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { Listing } from '@/types';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getCategories } from '@/constants/categories';
import { germanCities } from '@/constants/german-cities';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';
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
  const { showToast } = useToast();
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSoldConfirm, setShowSoldConfirm] = useState(false);
  const [status, setStatus] = useState<string>(listing.status || 'active');
  const isRejected = (listing.status as string) === 'rejected';
  const conditionRef = useRef<HTMLDivElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const currencyRef = useRef<HTMLButtonElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
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
    const queryTrimmed = locationQuery.trim();
    
    // Сортуємо: спочатку точні збіги, потім починаються з запиту, потім містять запит
    const exactMatches: string[] = [];
    const startsWith: string[] = [];
    const includes: string[] = [];
    
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
    
    const allResults = [...exactMatches, ...startsWith, ...includes];
    
    // Додаємо введений текст першим, якщо він не точно збігається
    const hasExactMatch = allResults.some(city => city.toLowerCase() === query);
    if (!hasExactMatch && queryTrimmed) {
      allResults.unshift(queryTrimmed);
    }
    
    return allResults.slice(0, 15);
  }, [locationQuery, isLocationOpen]);

  useEffect(() => {
    if (isOpen) {
      // Перевіряємо, чи оголошення на модерації - забороняємо редагування
      if (listing.status === 'pending_moderation') {
        tg?.HapticFeedback.notificationOccurred('error');
        // Закриваємо модальне вікно та показуємо повідомлення
        setTimeout(() => {
          onClose();
          // Показуємо повідомлення через toast (потрібно передати showToast через пропси або використати глобальний)
        }, 0);
        return;
      }
      
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
  }, [isOpen, listing, onClose, tg]);

  const [isInputFocused, setIsInputFocused] = useState(false);

  // Відстежуємо фокус на полях введення для приховування кнопок
  useEffect(() => {
    if (!isOpen) return;

    let focusTimeout: NodeJS.Timeout | null = null;
    let blurTimeout: NodeJS.Timeout | null = null;

    const handleFocusIn = (e: FocusEvent) => {
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
        setIsInputFocused(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }

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

    const handleVisualViewportChange = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const keyboardOpen = viewportHeight < windowHeight * 0.75;
        
        if (keyboardOpen) {
          setIsInputFocused(true);
        } else {
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

    checkInitialState();

    document.addEventListener('focusin', handleFocusIn, true);
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

  // Блокуємо скрол body та html при відкритому модальному вікні (оптимізовано для плавності)
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.setAttribute('data-scroll-y', scrollY.toString());
      
      requestAnimationFrame(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
      });
    } else {
      const savedScrollY = document.body.getAttribute('data-scroll-y');
      
      requestAnimationFrame(() => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.documentElement.style.overflow = '';
        document.body.style.touchAction = '';
        document.body.removeAttribute('data-scroll-y');
        
        if (savedScrollY) {
          const scrollPosition = parseInt(savedScrollY, 10);
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
      document.body.style.touchAction = '';
      document.body.removeAttribute('data-scroll-y');
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
    
    if (files.length + imagePreviews.length > 10) {
      setErrors(prev => ({ ...prev, images: t('createListing.errors.imagesMax') }));
      e.target.value = '';
      return;
    }

    // Стискаємо зображення перед додаванням
    const compressedFiles: File[] = [];
    for (const file of files) {
      try {
        // Якщо файл більше 2MB, стискаємо
        if (file.size > 2 * 1024 * 1024) {
          console.log('[EditListingModal] Compressing image:', file.name);
          const compressed = await compressImageOnClient(file, 2);
          compressedFiles.push(compressed);
        } else {
          compressedFiles.push(file);
        }
      } catch (error) {
        console.error('[EditListingModal] Failed to compress image, using original:', error);
        compressedFiles.push(file);
      }
    }

    // Додаємо стиснуті файли
    setImages(prev => [...prev, ...compressedFiles]);
    
    // Створюємо прев'ю для нових фото
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
    if (errors.images) setErrors(prev => ({ ...prev, images: '' }));
    e.target.value = '';
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

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    // Определяем, какие элементы перемещаем (старые или новые)
    const oldImagesCount = imagePreviews.length - images.length;
    
    if (fromIndex < oldImagesCount && toIndex < oldImagesCount) {
      // Перемещаем только старые изображения (только превью)
      setImagePreviews(prev => {
        const newPreviews = [...prev];
        const [removed] = newPreviews.splice(fromIndex, 1);
        newPreviews.splice(toIndex, 0, removed);
        return newPreviews;
      });
    } else if (fromIndex >= oldImagesCount && toIndex >= oldImagesCount) {
      // Перемещаем только новые изображения (и файлы, и превью)
      const fromNewIndex = fromIndex - oldImagesCount;
      const toNewIndex = toIndex - oldImagesCount;
      
      setImages(prev => {
        const newImages = [...prev];
        const [removed] = newImages.splice(fromNewIndex, 1);
        newImages.splice(toNewIndex, 0, removed);
        return newImages;
      });
      
      setImagePreviews(prev => {
        const newPreviews = [...prev];
        const [removed] = newPreviews.splice(fromIndex, 1);
        newPreviews.splice(toIndex, 0, removed);
        return newPreviews;
      });
    } else {
      // Перемещаем между старыми и новыми - перемещаем все превью, но не файлы
      setImagePreviews(prev => {
        const newPreviews = [...prev];
        const [removed] = newPreviews.splice(fromIndex, 1);
        newPreviews.splice(toIndex, 0, removed);
        return newPreviews;
      });
    }
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
    // Показуємо індикатор завантаження одразу
    tg?.HapticFeedback.impactOccurred('light');
    
    try {
      // Для відхилених оголошень автоматично встановлюємо статус, який призведе до відправки на модерацію
      // API endpoint автоматично відправить rejected оголошення на модерацію при збереженні
      const statusToSend = isRejected ? 'rejected' : (status || 'active');
      
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
        status: statusToSend,
        images,
        imagePreviews,
      });
      onClose();
    } catch (error) {
      console.error('Error saving listing:', error);
      showToast(t('editListing.updateError') || 'Помилка оновлення оголошення', 'error');
      tg?.HapticFeedback.notificationOccurred('error');
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

  // Додаткова захист: якщо оголошення на модерації, не показуємо модальне вікно
  if (listing.status === 'pending_moderation') {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-[#000000] flex flex-col overflow-hidden" 
      style={{ 
        zIndex: 9999, 
        isolation: 'isolate',
        touchAction: 'pan-y',
        position: 'fixed',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0
      }}
      onTouchMove={(e) => {
        // Предотвращаем закрытие приложения во время перетаскивания
        if (isDraggingRef.current) {
          e.preventDefault();
        }
      }}
    >
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
          paddingBottom: 'calc(8rem + env(safe-area-inset-bottom, 0px))',
          background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), #000000'
        }}>
          {/* Інформація про відхилення для відхилених оголошень */}
          {isRejected && listing.rejectionReason && (
            <div className="bg-red-600/20 border border-red-500/50 rounded-xl p-4 mb-4">
              <div className="text-red-400 font-semibold text-sm mb-2">
                {t('profile.rejectionReason') || 'Причина відхилення:'}
              </div>
              <div className="text-red-300 text-sm">
                {listing.rejectionReason}
              </div>
              <div className="text-red-400/70 text-xs mt-2">
                {t('editListing.submitAgain') || 'Активувати'} - щоб відправити виправлене оголошення на повторну перевірку
              </div>
            </div>
          )}
          {/* Фото */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Фото * {imagePreviews.length}/10
            </label>
            {/* Прогрес-бар стиснення зображень */}
            <div className="grid grid-cols-3 gap-2 relative">
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
                    key={`${index}-${typeof preview === 'string' ? preview.substring(0, 20) : index}`}
                    data-photo-index={index}
                    className={`relative aspect-square rounded-xl overflow-hidden bg-[#1C1C1C] border cursor-move select-none ${
                      isDragging ? 'opacity-95 z-50 shadow-2xl border-[#D3F1A7]/50' : 
                      isHovered ? 'ring-2 ring-[#D3F1A7] ring-offset-2 ring-offset-[#0A0A0A] border-[#D3F1A7]/30' : 
                      isSnapping ? 'border-[#D3F1A7]/40' :
                      'border-white/20'
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
                    className="w-full h-full object-cover pointer-events-none"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(index);
                    }}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/70 transition-colors z-10"
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>
                );
              })}
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
                className={`w-full px-4 py-3 pl-10 bg-[#1C1C1C] rounded-xl border text-white placeholder:text-white/50 ${
                  errors.location ? 'border-red-500' : 'border-white/20'
                } focus:outline-none focus:ring-2 focus:ring-[#D3F1A7]/50 focus:border-[#D3F1A7]`}
              />
              <MapPin 
                size={18} 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70"
              />
            </div>
            
            {isLocationOpen && filteredCities.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-[#1C1C1C] rounded-xl border border-white/20 shadow-lg max-h-60 overflow-y-auto" style={{ maxHeight: 'calc(15rem - env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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
                    className="w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center gap-2.5 text-white"
                  >
                    <MapPin size={16} className="text-white/70 flex-shrink-0" />
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
                  const isPendingModeration = (listing.status as string) === 'pending_moderation';
                  if (isPendingModeration) {
                    showToast(t('editListing.cannotEditOnModeration') || 'Не можна позначати як продане під час модерації', 'error');
                    tg?.HapticFeedback.notificationOccurred('error');
                    return;
                  }
                  setShowSoldConfirm(true);
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                disabled={(listing.status as string) === 'pending_moderation'}
                className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  (listing.status as string) === 'pending_moderation'
                    ? 'border-white/10 bg-[#1C1C1C]/50 text-white/50 cursor-not-allowed opacity-50'
                    : status === 'sold'
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
                  setStatus('deactivated');
                  tg?.HapticFeedback.impactOccurred('light');
                }}
                className={`w-full px-4 py-3.5 rounded-xl border-2 transition-all text-sm font-semibold flex items-center justify-center gap-2 ${
                  status === 'deactivated'
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
        <div 
          ref={buttonsRef}
          className="bg-[#000000] border-t border-white/20 px-4 pt-4 pb-4 flex gap-2 safe-area-bottom shadow-lg transition-transform duration-200 ease-in-out" 
          style={{ 
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', 
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            transform: isInputFocused ? 'translateY(100%)' : 'translateY(0)',
            visibility: isInputFocused ? 'hidden' : 'visible',
            opacity: isInputFocused ? 0 : 1,
            pointerEvents: isInputFocused ? 'none' : 'auto',
            // Додаткова фіксація для запобігання підтягуванню
            willChange: 'transform'
          } as React.CSSProperties}
        >
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            className="px-4 py-3 bg-transparent border border-red-500/50 text-red-500 rounded-xl text-sm font-medium hover:bg-red-500/10 hover:border-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            className="flex-1 px-4 py-3 bg-[#D3F1A7] text-black rounded-xl text-sm font-medium hover:bg-[#D3F1A7]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                <span>{isRejected ? t('editListing.savingAndSubmitting') : t('editListing.saving')}</span>
              </>
            ) : (
              <span>{isRejected ? t('editListing.submitAgain') : t('common.save')}</span>
            )}
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
            const isPendingModeration = (listing.status as string) === 'pending_moderation';
            if (isPendingModeration) {
              showToast(t('editListing.cannotEditOnModeration') || 'Не можна позначати як продане під час модерації', 'error');
              setShowSoldConfirm(false);
              return;
            }
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


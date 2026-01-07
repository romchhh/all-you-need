'use client';

import { X, MapPin, Search, Check } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment, useMemo, useRef } from 'react';
import { germanCities } from '@/constants/german-cities';

interface TouchStart {
  y: number;
  scrollTop: number;
}

// Список великих міст Німеччини (в порядку як зазначено користувачем)
const majorGermanCities = [
  'Hamburg',
  'Bremen',
  'Hannover',
  'Berlin',
  'Dortmund',
  'Köln',
  'Leipzig',
  'Frankfurt am Main',
  'Stuttgart',
  'München'
];

// Маппінг популярних індексів до міст (для прикладу)
// В реальному застосунку можна використовувати API або більший список
const postalCodeToCity: Record<string, string> = {
  '22880': 'Wedel',
  '20095': 'Hamburg',
  '10115': 'Berlin',
  '80331': 'München',
  '50667': 'Köln',
  '60311': 'Frankfurt am Main',
  '70173': 'Stuttgart',
  '40213': 'Düsseldorf',
  '44135': 'Dortmund',
  '04109': 'Leipzig',
  '28195': 'Bremen',
  '30159': 'Hannover',
};

// Функція пошуку міста по індексу або назві
function searchCityByIndexOrName(query: string): string[] {
  const normalizedQuery = query.trim();
  
  if (!normalizedQuery) return [];
  
  // Перевіряємо чи це індекс (5 цифр)
  const isPostalCode = /^\d{5}$/.test(normalizedQuery);
  
  if (isPostalCode) {
    // Спочатку перевіряємо маппінг
    const mappedCity = postalCodeToCity[normalizedQuery];
    if (mappedCity) {
      // Перевіряємо чи місто є в списку
      const cityExists = germanCities.some(c => 
        c.toLowerCase() === mappedCity.toLowerCase()
      );
      if (cityExists) {
        return [mappedCity];
      }
      // Якщо міста немає в списку, все одно повертаємо його (для майбутнього розширення)
      return [mappedCity];
    }
    
    // Якщо немає в маппінгу, шукаємо в назвах міст (на випадок якщо індекс міститься в назві)
    const results = germanCities.filter(city => 
      city.toLowerCase().includes(normalizedQuery.toLowerCase())
    );
    if (results.length > 0) {
      return results.slice(0, 10);
    }
    
    // Якщо нічого не знайдено, повертаємо порожній масив
    // В реальному застосунку тут можна використовувати API для пошуку по індексу
    return [];
  }
  
  // Якщо це не індекс, шукаємо по назві (незалежно від регістру)
  const lowerQuery = normalizedQuery.toLowerCase();
  return germanCities.filter(city => 
    city.toLowerCase().includes(lowerQuery)
  ).slice(0, 10);
}

interface CityModalProps {
  isOpen: boolean;
  selectedCities: string[];
  onClose: () => void;
  onSelect: (cities: string[]) => void;
  tg: TelegramWebApp | null;
}

export const CityModal = ({ 
  isOpen, 
  selectedCities,
  onClose, 
  onSelect,
  tg 
}: CityModalProps) => {
  const { t } = useLanguage();
  const [localSelectedCities, setLocalSelectedCities] = useState<string[]>(selectedCities);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Зберігаємо функції в ref для гарантії актуальності
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  const touchStartRef = useRef<TouchStart | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
    onSelectRef.current = onSelect;
  }, [onClose, onSelect]);

  useEffect(() => {
    if (isOpen) {
      setLocalSelectedCities([...selectedCities]);
      setSearchQuery('');
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
  }, [isOpen, selectedCities]);

  // Фільтруємо результати пошуку
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    return searchCityByIndexOrName(searchQuery);
  }, [searchQuery]);

  // Обробка вибору/зняття вибору міста
  const toggleCity = (city: string) => {
    if (city === '') {
      // Якщо вибрано "Всі міста", очищаємо вибір
      setLocalSelectedCities([]);
    } else {
      setLocalSelectedCities(prev => {
        if (prev.includes(city)) {
          // Якщо місто вже вибрано, знімаємо вибір
          return prev.filter(c => c !== city);
        } else {
          // Додаємо місто до вибраних
          return [...prev, city];
        }
      });
    }
  };

  // Обробка застосування
  const handleApply = () => {
    onSelectRef.current([...localSelectedCities]);
    setTimeout(() => {
      onCloseRef.current();
    }, 50);
  };

  // Обробка скидання
  const handleReset = () => {
    setLocalSelectedCities([]);
    onSelectRef.current([]);
    setTimeout(() => {
      onCloseRef.current();
    }, 50);
  };

  if (!isOpen) return null;

  return (
    <Fragment>
      <div 
        className="fixed inset-0 bg-black/40 z-50 flex items-end" 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          // Блокуємо pull-to-refresh на фоні модального вікна
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          // Блокуємо pull-to-refresh на фоні модального вікна
          e.preventDefault();
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
        }}
      >
        <div 
          className="w-full bg-white rounded-t-3xl flex flex-col max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Закріплена шапка */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
            <h3 className="text-xl font-bold text-gray-900">{t('bazaar.selectCity')}</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X size={18} className="text-gray-900" />
            </button>
          </div>

          {/* Скролований контент */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
            onTouchStart={(e) => {
              e.stopPropagation();
              if (scrollContainerRef.current) {
                touchStartRef.current = {
                  y: e.touches[0].clientY,
                  scrollTop: scrollContainerRef.current.scrollTop
                };
              }
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              if (!touchStartRef.current || !scrollContainerRef.current) return;
              
              const currentY = e.touches[0].clientY;
              const deltaY = currentY - touchStartRef.current.y;
              const scrollTop = scrollContainerRef.current.scrollTop;
              
              // Якщо на початку скролу і тягнемо вниз, блокуємо pull-to-refresh
              if (scrollTop === 0 && deltaY > 0) {
                e.preventDefault();
              }
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              touchStartRef.current = null;
            }}
          >
            <div className="p-6 space-y-4">
              {/* Пошук */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('bazaar.searchCity') || 'Пошук по назві або індексу (наприклад: 22880 або Wedel)'}
                  className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
                />
              </div>

              {/* Всі міста (за замовчуванням) */}
              <div>
                <button
                  onClick={() => toggleCity('')}
                  className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 ${
                    localSelectedCities.length === 0
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <MapPin size={16} className={localSelectedCities.length === 0 ? 'text-white' : 'text-gray-400'} />
                  <span className="font-medium">{t('bazaar.allCities') || 'Всі міста'}</span>
                </button>
              </div>

              {/* Показуємо вибрані міста */}
              {localSelectedCities.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    {t('bazaar.selectedCities')} ({localSelectedCities.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {localSelectedCities.map((city) => (
                      <button
                        key={city}
                        onClick={() => toggleCity(city)}
                        className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors flex items-center gap-1"
                      >
                        <span>{city}</span>
                        <X size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Великі міста */}
              {!searchQuery && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.majorCities')}</h4>
                  <div className="space-y-2">
                    {majorGermanCities.map((city) => {
                      const isSelected = localSelectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          onClick={() => toggleCity(city)}
                          className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected 
                              ? 'border-white bg-white' 
                              : 'border-gray-400'
                          }`}>
                            {isSelected && (
                              <Check size={12} className="text-blue-500" strokeWidth={3} />
                            )}
                          </div>
                          <MapPin size={16} className={isSelected ? 'text-white' : 'text-gray-400'} />
                          <span>{city}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Результати пошуку */}
              {searchQuery && searchResults.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('bazaar.searchResults')}</h4>
                  <div className="space-y-2">
                    {searchResults.map((city) => {
                      const isSelected = localSelectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          onClick={() => toggleCity(city)}
                          className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected 
                              ? 'border-white bg-white' 
                              : 'border-gray-400'
                          }`}>
                            {isSelected && (
                              <Check size={12} className="text-blue-500" strokeWidth={3} />
                            )}
                          </div>
                          <MapPin size={16} className={isSelected ? 'text-white' : 'text-gray-400'} />
                          <span>{city}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Повідомлення якщо нічого не знайдено */}
              {searchQuery && searchResults.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>{t('common.nothingFound')}</p>
                  <p className="text-sm mt-2">{t('bazaar.tryPostalCode')}</p>
                </div>
              )}

              {/* Кнопки застосування */}
              <div className="pt-4 pb-24 flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-xl font-semibold hover:bg-gray-200 transition-colors active:bg-gray-300"
                >
                  {t('common.reset')}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 px-4 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors active:bg-green-700"
                >
                  {t('common.apply') || 'Застосувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
};


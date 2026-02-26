'use client';

import { X, MapPin, Search, Check } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment, useMemo, useRef } from 'react';
import { germanCities, fetchGermanCitiesFromAPI, isGermanCityValid } from '@/constants/german-cities';

interface TouchStart {
  y: number;
  scrollTop: number;
}

// Список великих міст Німеччини (в порядку як зазначено користувачем)
const majorGermanCities = [
  'Berlin',
  'Hamburg',
  'München',
  'Köln',
  'Frankfurt',
  'Stuttgart',
  'Düsseldorf',
  'Leipzig',
  'Dortmund',
  'Essen',
  'Bremen',
  'Dresden',
  'Hannover',
  'Nürnberg',
  'Duisburg'
];

// Перевіряємо, що всі міста зі списку є в базовому списку germanCities
const validMajorGermanCities = majorGermanCities.filter((city) => isGermanCityValid(city));

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
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  
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

  // Загружаємо міста з API при зміні запиту
  useEffect(() => {
    const loadCities = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      const query = searchQuery.toLowerCase().trim();
      
      // Спочатку перевіряємо чи це індекс (5 цифр)
      const isPostalCode = /^\d{5}$/.test(query);
      
      if (isPostalCode) {
        // Пошук по індексу - спочатку перевіряємо маппінг
        const mappedCity = postalCodeToCity[query];
        if (mappedCity) {
          setSearchResults([mappedCity]);
          return;
        }
      }

      setLoadingCities(true);
      try {
        // Загружаємо з API
        const result = await fetchGermanCitiesFromAPI(searchQuery, 20);
        
        // Якщо це індекс і є результат з API, використовуємо його
        if (isPostalCode) {
          setSearchResults(result.cities.slice(0, 20));
        } else {
          // Для пошуку по назві сортуємо: спочатку точні збіги, потім починаються з запиту, потім містять запит
          const lowerQuery = query.toLowerCase();
          const queryTrimmed = searchQuery.trim();
          
          const exactMatches = result.cities.filter(city => 
            city.toLowerCase() === lowerQuery
          );
          const startsWith = result.cities.filter(city => 
            city.toLowerCase().startsWith(lowerQuery) && city.toLowerCase() !== lowerQuery
          );
          const includes = result.cities.filter(city => 
            city.toLowerCase().includes(lowerQuery) && !city.toLowerCase().startsWith(lowerQuery)
          );
          
          const allResults = [...exactMatches, ...startsWith, ...includes];
          
          // Додаємо введений текст першим, якщо він не точно збігається
          const hasExactMatch = allResults.some(city => city.toLowerCase() === lowerQuery);
          if (!hasExactMatch && queryTrimmed) {
            allResults.unshift(queryTrimmed);
          }
          
          setSearchResults(allResults.slice(0, 30));
        }
      } catch (error) {
        console.error('Error loading cities:', error);
        // Fallback на локальний пошук
        if (isPostalCode) {
          const mappedCity = postalCodeToCity[query];
          if (mappedCity) {
            setSearchResults([mappedCity]);
          } else {
            const localResults = germanCities.filter(city => 
              city.toLowerCase().includes(query)
            ).slice(0, 10);
            setSearchResults(localResults);
          }
        } else {
          const lowerQuery = query.toLowerCase();
          const queryTrimmed = searchQuery.trim();
          
          const exactMatches = germanCities.filter(city => 
            city.toLowerCase() === lowerQuery
          );
          const startsWith = germanCities.filter(city => 
            city.toLowerCase().startsWith(lowerQuery) && city.toLowerCase() !== lowerQuery
          );
          const includes = germanCities.filter(city => 
            city.toLowerCase().includes(lowerQuery) && !city.toLowerCase().startsWith(lowerQuery)
          );
          
          const allResults = [...exactMatches, ...startsWith, ...includes];
          
          // Додаємо введений текст першим, якщо він не точно збігається
          const hasExactMatch = allResults.some(city => city.toLowerCase() === lowerQuery);
          if (!hasExactMatch && queryTrimmed) {
            allResults.unshift(queryTrimmed);
          }
          
          setSearchResults(allResults.slice(0, 20));
        }
      } finally {
        setLoadingCities(false);
      }
    };

    // Debounce запиту
    const timeoutId = setTimeout(() => {
      loadCities();
    }, 300);

    return () => clearTimeout(timeoutId);
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
            // При закритті через клік на фон - застосовуємо вибір міста (якщо є зміни)
            if (localSelectedCities.length !== selectedCities.length || 
                localSelectedCities.some((city, idx) => city !== selectedCities[idx])) {
              handleApply();
            } else {
              onClose();
            }
            tg?.HapticFeedback.impactOccurred('light');
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
          className="w-full rounded-t-3xl border-t-2 border-white flex flex-col max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'radial-gradient(ellipse 80% 100% at 20% 0%, #3F5331 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, #3F5331 0%, transparent 40%), #000000'
          }}
        >
          {/* Закріплена шапка */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700/50 flex-shrink-0">
            <h3 className="text-xl font-bold text-white">{t('bazaar.selectCity')}</h3>
            <button
              onClick={() => {
                // При закритті через X - застосовуємо вибір міста (якщо є зміни)
                if (localSelectedCities.length !== selectedCities.length || 
                    localSelectedCities.some((city, idx) => city !== selectedCities[idx])) {
                  handleApply();
                } else {
                  onClose();
                }
                tg?.HapticFeedback.impactOccurred('light');
              }}
              className="w-8 h-8 rounded-full bg-gray-800/50 flex items-center justify-center hover:bg-gray-700/50 transition-colors"
            >
              <X size={18} className="text-white" />
            </button>
          </div>

          {/* Скролований контент */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
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
                <Search 
                  className="absolute top-1/2 -translate-y-1/2 text-white/80" 
                  size={18} 
                  style={{ left: '12px' }}
                />
                <input
                  ref={(el) => {
                    if (el && isOpen) {
                      setTimeout(() => el.focus(), 100);
                    }
                  }}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Search') {
                      e.preventDefault();
                      const input = e.target as HTMLInputElement;
                      input.blur();
                      tg?.HapticFeedback.impactOccurred('light');
                    }
                  }}
                  placeholder={t('bazaar.searchCity') || 'Пошук по назві або індексу (наприклад: 22880 або Wedel)'}
                  className="w-full pr-4 py-3 pl-10 bg-transparent rounded-xl border border-white focus:outline-none focus:ring-2 focus:ring-white/50 text-white placeholder:text-white/60"
                />
              </div>

              {/* Всі міста (за замовчуванням) */}
              <div>
                <button
                  onClick={() => toggleCity('')}
                  className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                    localSelectedCities.length === 0
                      ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                      : 'border-white text-white bg-transparent hover:bg-white/10'
                  }`}
                >
                  <MapPin size={16} className={`flex-shrink-0 mr-2 ${localSelectedCities.length === 0 ? 'text-[#D3F1A7]' : 'text-white'}`} />
                  <span className="font-medium">{t('bazaar.allCities') || 'Всі міста'}</span>
                </button>
              </div>

              {/* Показуємо вибрані міста */}
              {localSelectedCities.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-3">
                    {t('bazaar.selectedCities')} ({localSelectedCities.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {localSelectedCities.map((city) => (
                      <button
                        key={city}
                        onClick={() => toggleCity(city)}
                        className="px-3 py-1.5 bg-[#D3F1A7] text-black rounded-lg text-sm font-medium hover:bg-[#D3F1A7]/80 transition-colors flex items-center gap-1"
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
                  <h4 className="text-sm font-semibold text-white mb-3">{t('bazaar.majorCities')}</h4>
                  <div className="space-y-2">
                    {validMajorGermanCities.map((city) => {
                      const isSelected = localSelectedCities.includes(city);
                      return (
                        <button
                          key={city}
                          onClick={() => toggleCity(city)}
                          className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                            isSelected
                              ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                              : 'border-white text-white bg-transparent hover:bg-white/10'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected 
                              ? 'border-[#D3F1A7] bg-[#D3F1A7]' 
                              : 'border-white'
                          }`}>
                            {isSelected && (
                              <Check size={12} className="text-black" strokeWidth={3} />
                            )}
                          </div>
                          <MapPin size={16} className={`flex-shrink-0 ${isSelected ? 'text-[#D3F1A7]' : 'text-white'}`} />
                          <span>{city}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Результати пошуку */}
              {searchQuery && (
                <div>
                  {loadingCities ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[#D3F1A7] border-t-transparent rounded-full animate-spin mb-2"></div>
                      <p className="text-white/70 text-sm">{t('common.loading')}</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <>
                      <h4 className="text-sm font-semibold text-white mb-3">{t('bazaar.searchResults')}</h4>
                      <div className="space-y-2">
                        {searchResults.map((city) => {
                          const isSelected = localSelectedCities.includes(city);
                          return (
                            <button
                              key={city}
                              onClick={() => toggleCity(city)}
                              className={`w-full px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                                isSelected
                                  ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                                  : 'border-white text-white bg-transparent hover:bg-white/10'
                              }`}
                            >
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected 
                                  ? 'border-[#D3F1A7] bg-[#D3F1A7]' 
                                  : 'border-white'
                              }`}>
                                {isSelected && (
                                  <Check size={12} className="text-black" strokeWidth={3} />
                                )}
                              </div>
                              <MapPin size={16} className={`flex-shrink-0 ${isSelected ? 'text-[#D3F1A7]' : 'text-white'}`} />
                              <span>{city}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-white/60">
                      <p>{t('common.nothingFound')}</p>
                      <p className="text-sm mt-2">{t('bazaar.tryPostalCode')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Кнопки застосування */}
              <div className="pt-4 pb-24 flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 px-4 py-3 bg-transparent border border-white text-white rounded-xl font-semibold hover:bg-white/10 transition-colors active:bg-white/20"
                >
                  {t('common.reset')}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex-1 px-4 py-3 bg-[#D3F1A7] text-black rounded-xl font-semibold hover:bg-[#D3F1A7]/80 transition-colors active:bg-[#D3F1A7]/70"
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


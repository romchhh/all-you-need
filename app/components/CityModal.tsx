'use client';

import { X, MapPin, Search, Check, Bell, BellOff, ChevronDown } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState, useEffect, Fragment, useRef, useCallback, useMemo, type MouseEvent } from 'react';
import { normalizeCityInput } from '@/utils/cityNormalization';
import { germanCities, fetchGermanCitiesFromAPI, isGermanCityValid } from '@/constants/german-cities';
import { majorGermanCities } from '@/constants/major-german-cities';

interface TouchStart {
  y: number;
  scrollTop: number;
}

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
  profileTelegramId?: string | null;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const CityModal = ({ 
  isOpen, 
  selectedCities,
  onClose, 
  onSelect,
  tg,
  profileTelegramId,
  onToast
}: CityModalProps) => {
  const { t } = useLanguage();
  const [localSelectedCities, setLocalSelectedCities] = useState<string[]>(selectedCities);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySubCities, setCitySubCities] = useState<string[]>([]);
  const [citySubBusyKey, setCitySubBusyKey] = useState<string | null>(null);
  const [subsDropdownOpen, setSubsDropdownOpen] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  
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
      setSubsDropdownOpen(false);
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

  useEffect(() => {
    if (!isOpen) return;
    if (!profileTelegramId) {
      setCitySubCities([]);
      return;
    }
    setSubsLoading(true);
    let cancelled = false;
    fetch(`/api/city-subscriptions?telegramId=${encodeURIComponent(profileTelegramId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setCitySubCities(Array.isArray(d.cities) ? d.cities : []);
      })
      .catch(() => {
        if (!cancelled) setCitySubCities([]);
      })
      .finally(() => {
        if (!cancelled) setSubsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, profileTelegramId]);

  const cityDisplayByKey = useMemo(() => {
    const map = new Map<string, string>();
    germanCities.forEach((city) => {
      map.set(normalizeCityInput(city), city);
    });
    return map;
  }, []);

  const subscribedCityOptions = useMemo(() => {
    const titleCase = (value: string) =>
      value
        .split(/[\s-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    return citySubCities.map((cityKey) => ({
      cityKey,
      label: cityDisplayByKey.get(cityKey) || titleCase(cityKey),
    }));
  }, [cityDisplayByKey, citySubCities]);

  const toggleSubscription = useCallback(
    async (e: MouseEvent, city: string) => {
      e.preventDefault();
      e.stopPropagation();
      const cityKey = normalizeCityInput(city.trim());
      if (!cityKey) return;
      if (!profileTelegramId) {
        onToast?.(t('bazaar.citySubscribeNeedLogin'), 'info');
        return;
      }
      if (citySubBusyKey !== null) return;
      setCitySubBusyKey(cityKey);
      try {
        const subscribed = citySubCities.includes(cityKey);
        if (subscribed) {
          const r = await fetch(
            `/api/city-subscriptions?telegramId=${encodeURIComponent(profileTelegramId)}&city=${encodeURIComponent(cityKey)}`,
            { method: 'DELETE' }
          );
          if (r.ok) {
            setCitySubCities((c) => c.filter((x) => x !== cityKey));
            onToast?.(t('bazaar.citySubscribeRemoved'), 'success');
          } else {
            onToast?.(t('common.error'), 'error');
          }
        } else {
          const r = await fetch('/api/city-subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: profileTelegramId, city: cityKey }),
          });
          if (r.ok) {
            setCitySubCities((c) => [...new Set([...c, cityKey])].sort());
            onToast?.(t('bazaar.citySubscribeSuccess'), 'success');
          } else {
            onToast?.(t('common.error'), 'error');
          }
        }
        tg?.HapticFeedback?.impactOccurred?.('light');
      } finally {
        setCitySubBusyKey(null);
      }
    },
    [profileTelegramId, citySubBusyKey, citySubCities, onToast, t, tg]
  );

  const renderCityBell = (city: string, onLightBg: boolean) => {
    const cityKey = normalizeCityInput(city);
    const sub = citySubCities.includes(cityKey);
    const busyAll = citySubBusyKey !== null;
    const wrap = onLightBg
      ? sub
        ? 'border-gray-900/35 bg-black/10'
        : 'border-black/25 hover:bg-black/8'
      : sub
        ? 'border-[#D3F1A7] bg-[#D3F1A7]/15'
        : 'border-white/40 hover:bg-white/10';
    const icon = onLightBg
      ? sub
        ? 'text-gray-900'
        : 'text-gray-800'
      : sub
        ? 'text-[#D3F1A7]'
        : 'text-white/80';
    return (
      <button
        type="button"
        onClick={(e) => void toggleSubscription(e, city)}
        disabled={busyAll}
        title={t('bazaar.citySubscribeBell')}
        aria-label={t('bazaar.citySubscribeBell')}
        className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-colors border disabled:opacity-45 ${wrap}`}
      >
        <Bell
          size={17}
          className={icon}
          fill={sub ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </button>
    );
  };

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
                  onChange={(e) => {
                    const value = e.target.value;
                    // Забороняємо кирилицю у полі пошуку міст (тільки латиниця/цифри)
                    const cleaned = value.replace(/[\u0400-\u04FF]+/g, '');
                    setSearchQuery(cleaned);
                  }}
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

              {/* Всі міста + швидкий вибір міст із підписок */}
              <div className="flex gap-2 items-stretch">
                <button
                  type="button"
                  onClick={() => toggleCity('')}
                  className={`min-w-0 flex-1 px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                    localSelectedCities.length === 0
                      ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                      : 'border-white text-white bg-transparent hover:bg-white/10'
                  }`}
                >
                  <MapPin size={16} className={`flex-shrink-0 mr-2 ${localSelectedCities.length === 0 ? 'text-[#D3F1A7]' : 'text-white'}`} />
                  <span className="font-medium truncate">{t('bazaar.allCities') || 'Всі міста'}</span>
                </button>
                {profileTelegramId && (
                  <div className="shrink-0 self-stretch">
                    <button
                      type="button"
                      onClick={() => setSubsDropdownOpen((o) => !o)}
                      className={`h-full min-h-[48px] min-w-[50px] px-3 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        subsDropdownOpen
                          ? 'border-[#D3F1A7] text-[#D3F1A7] bg-white/5'
                          : 'border-white text-white hover:bg-white/10'
                      }`}
                      title={t('bazaar.subscribedCitiesMenu')}
                      aria-expanded={subsDropdownOpen}
                      aria-controls="subscribed-cities-inline-list"
                    >
                      <Bell size={16} className={subsDropdownOpen ? 'text-[#D3F1A7]' : 'text-white'} />
                      <ChevronDown
                        size={14}
                        className={`opacity-90 transition-transform ${subsDropdownOpen ? 'rotate-180 text-[#D3F1A7]' : ''}`}
                      />
                    </button>
                  </div>
                )}
              </div>
              {profileTelegramId && subsDropdownOpen && (
                <div
                  id="subscribed-cities-inline-list"
                  className="rounded-xl border border-white/25 bg-[#1a1a1a] py-1"
                  role="listbox"
                >
                  <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-white/60">
                    {t('bazaar.subscribedCitiesMenu')}
                  </div>
                  {subsLoading && (
                    <div className="px-3 py-2.5 text-sm text-white/70">{t('common.loading')}</div>
                  )}
                  {!subsLoading && subscribedCityOptions.length === 0 && (
                    <div className="px-3 py-2.5 text-sm text-white/70">
                      {t('bazaar.subscribedCitiesEmpty')}
                    </div>
                  )}
                  {!subsLoading && subscribedCityOptions.map(({ cityKey, label }) => {
                    const selected = localSelectedCities.includes(label);
                    return (
                      <div key={cityKey} className="w-full px-2 py-1.5 flex items-center gap-2">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className="min-w-0 flex-1 px-2 py-2 text-left text-sm text-white hover:bg-white/10 rounded-lg flex items-center gap-2"
                          onClick={() => {
                            toggleCity(label);
                            tg?.HapticFeedback?.impactOccurred?.('light');
                          }}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selected ? 'border-[#D3F1A7] bg-[#D3F1A7]' : 'border-white/50'
                            }`}
                          >
                            {selected ? <Check size={10} className="text-black" strokeWidth={3} /> : null}
                          </span>
                          <span className="truncate">{label}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void toggleSubscription(e, cityKey)}
                          disabled={citySubBusyKey !== null}
                          title={t('bazaar.citySubscribeRemoved')}
                          aria-label={t('bazaar.citySubscribeRemoved')}
                          className="w-9 h-9 shrink-0 rounded-lg border border-white/35 text-white/80 hover:bg-white/10 disabled:opacity-45 flex items-center justify-center"
                        >
                          <BellOff size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Показуємо вибрані міста */}
              {localSelectedCities.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-white mb-3">
                    {t('bazaar.selectedCities')} ({localSelectedCities.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {localSelectedCities.map((city) => (
                      <div
                        key={city}
                        className="inline-flex items-center gap-1 pl-2 py-1 pr-1 bg-[#D3F1A7] text-black rounded-lg text-sm font-medium"
                      >
                        <span className="truncate max-w-[min(140px,40vw)]">{city}</span>
                        {renderCityBell(city, true)}
                        <button
                          type="button"
                          onClick={() => toggleCity(city)}
                          className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0"
                          aria-label={t('common.close')}
                        >
                          <X size={14} />
                        </button>
                      </div>
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
                        <div key={city} className="flex gap-2 items-stretch">
                          <button
                            type="button"
                            onClick={() => toggleCity(city)}
                            className={`flex-1 min-w-0 px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                              isSelected
                                ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                                : 'border-white text-white bg-transparent hover:bg-white/10'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                                  : 'border-white'
                              }`}
                            >
                              {isSelected && (
                                <Check size={12} className="text-black" strokeWidth={3} />
                              )}
                            </div>
                            <MapPin size={16} className={`flex-shrink-0 ${isSelected ? 'text-[#D3F1A7]' : 'text-white'}`} />
                            <span className="truncate">{city}</span>
                          </button>
                          {renderCityBell(city, false)}
                        </div>
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
                            <div key={city} className="flex gap-2 items-stretch">
                              <button
                                type="button"
                                onClick={() => toggleCity(city)}
                                className={`flex-1 min-w-0 px-4 py-3 text-left rounded-xl transition-colors flex items-center gap-2 border ${
                                  isSelected
                                    ? 'border-[#D3F1A7] text-[#D3F1A7] bg-transparent'
                                    : 'border-white text-white bg-transparent hover:bg-white/10'
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                    isSelected
                                      ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                                      : 'border-white'
                                  }`}
                                >
                                  {isSelected && (
                                    <Check size={12} className="text-black" strokeWidth={3} />
                                  )}
                                </div>
                                <MapPin size={16} className={`flex-shrink-0 ${isSelected ? 'text-[#D3F1A7]' : 'text-white'}`} />
                                <span className="truncate">{city}</span>
                              </button>
                              {renderCityBell(city, false)}
                            </div>
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


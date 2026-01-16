'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTelegram } from '@/hooks/useTelegram';

interface ListingPackage {
  type: string;
  count: number;
  price: number;
  save?: string;
  badge?: string;
}

interface ListingPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPackage: (packageType: string) => void;
  telegramId?: string;
}

const PACKAGES: ListingPackage[] = [
  { type: 'single_1', count: 1, price: 2.0 },
  { type: 'pack_5', count: 5, price: 8.0, save: '20%', badge: 'mostPopular' },
  { type: 'pack_10', count: 10, price: 14.0, save: '30%', badge: 'bestValue' },
];

export default function ListingPackageModal({
  isOpen,
  onClose,
  onSelectPackage,
  telegramId,
}: ListingPackageModalProps) {
  const { t } = useLanguage();
  const { user } = useTelegram();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [packagesBalance, setPackagesBalance] = useState(0);
  const [hasUsedFreeAd, setHasUsedFreeAd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Використовуємо telegramId з пропсів або з user
  const userId = telegramId || user?.id;

  // Блокуємо скрол при відкритті модального вікна
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchBalance();
    }
  }, [isOpen, userId]);

  const fetchBalance = async () => {
    try {
      const response = await fetch(`/api/user/balance?telegramId=${userId}`);
      const data = await response.json();
      if (data) {
        setBalance(data.balance || 0);
        setPackagesBalance(data.listingPackagesBalance || 0);
        setHasUsedFreeAd(data.hasUsedFreeAd || false);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const handleSelectPackage = async () => {
    if (!selectedPackage) return;

    setLoading(true);
    onSelectPackage(selectedPackage);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#000000] rounded-2xl border-2 border-white max-w-md w-full max-h-[90vh] overflow-y-auto relative z-[10000]">
        {/* Header */}
        <div className="sticky top-0 bg-[#000000] border-b border-white/20 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              {t('listingPackages.title')}
            </h2>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-white/70 mt-2">
            {t('listingPackages.description')}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Показуємо баланс */}
          <div className="bg-[#1C1C1C] rounded-xl p-4 border border-white/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-white/70">{t('payments.currentBalance')}</p>
                <p className="text-2xl font-bold text-[#D3F1A7]">{balance.toFixed(2)}€</p>
              </div>
              <div>
                <p className="text-sm text-white/70">{t('listingPackages.availableListings')}</p>
                <p className="text-2xl font-bold text-[#D3F1A7]">{packagesBalance}</p>
              </div>
            </div>
          </div>

          {/* Безкоштовне оголошення */}
          {!hasUsedFreeAd && (
            <div className="bg-[#1C1C1C] rounded-xl p-4 border-2 border-[#D3F1A7]/30">
              <div className="flex items-start gap-3">
                <div className="bg-[#D3F1A7] rounded-full p-2 flex-shrink-0">
                  <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white">{t('listingPackages.free')}</h3>
                  <p className="text-sm text-white/70 mt-1">
                    {t('listingPackages.validFor')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Пакети */}
          {PACKAGES.map((pkg) => (
            <button
              key={pkg.type}
              onClick={() => setSelectedPackage(pkg.type)}
              className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                selectedPackage === pkg.type
                  ? 'border-[#D3F1A7] bg-[#D3F1A7]/20 shadow-md scale-[1.02]'
                  : 'border-white/20 bg-[#1C1C1C] hover:border-white/40 hover:bg-white/5'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-white">
                      {pkg.count === 1 
                        ? t('listingPackages.single') 
                        : pkg.count === 5 
                          ? t('listingPackages.pack5')
                          : t('listingPackages.pack10')}
                    </h3>
                    {pkg.badge && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        pkg.badge === 'mostPopular' 
                          ? 'bg-[#D3F1A7]/20 text-[#D3F1A7] border border-[#D3F1A7]/30' 
                          : 'bg-[#D3F1A7]/20 text-[#D3F1A7] border border-[#D3F1A7]/30'
                      }`}>
                        {t(`listingPackages.${pkg.badge}`)}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-[#D3F1A7] mt-2">
                    {pkg.price.toFixed(1)}€
                  </p>
                  {pkg.save && (
                    <p className="text-sm text-[#D3F1A7] font-medium mt-1">
                      {t('listingPackages.save')}: {pkg.save}
                    </p>
                  )}
                  <p className="text-xs text-white/70 mt-2">
                    {t('listingPackages.validFor')}
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedPackage === pkg.type
                    ? 'border-[#D3F1A7] bg-[#D3F1A7]'
                    : 'border-white/30'
                }`}>
                  {selectedPackage === pkg.type && (
                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#000000] border-t border-white/20 px-6 py-4 rounded-b-2xl">
          <button
            onClick={handleSelectPackage}
            disabled={!selectedPackage || loading}
            className={`w-full py-4 rounded-xl font-semibold text-black transition-all ${
              !selectedPackage || loading
                ? 'bg-white/20 cursor-not-allowed text-white/50'
                : 'bg-[#D3F1A7] hover:bg-[#D3F1A7]/90 shadow-lg hover:shadow-xl'
            }`}
          >
            {loading ? t('common.loading') : t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

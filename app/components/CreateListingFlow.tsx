'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';

// Динамічні імпорти для оптимізації
const ListingPackageModal = dynamic(() => import('./ListingPackageModal'), { ssr: false });
const PromotionModal = dynamic(() => import('./PromotionModal'), { ssr: false });
const CreateListingModal = dynamic(() => import('./CreateListingModal').then(mod => ({ default: mod.CreateListingModal })), { ssr: false });
const PaymentSummaryModal = dynamic(() => import('./PaymentSummaryModal').then(mod => ({ default: mod.PaymentSummaryModal })), { ssr: false });

interface CreateListingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  tg: TelegramWebApp | null;
  onSuccess?: () => void;
}

type Step = 'create_listing' | 'buy_package' | 'select_promotion' | 'payment_summary' | 'creating';

interface UserStatus {
  hasUsedFreeAd: boolean;
  listingPackagesBalance: number;
  paidListingsEnabled: boolean;
}

export default function CreateListingFlow({ isOpen, onClose, tg, onSuccess }: CreateListingFlowProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('create_listing');
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [createdListingId, setCreatedListingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingListingData, setPendingListingData] = useState<any>(null);
  const [selectedPackageType, setSelectedPackageType] = useState<string | null>(null);
  const [selectedPromotionType, setSelectedPromotionType] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'balance' | 'direct'>('balance');
  const [userBalance, setUserBalance] = useState<number>(0);

  // Хелпер для отримання telegramId з різних джерел
  const getTelegramId = (): string | null => {
    return tg?.initDataUnsafe?.user?.id?.toString()
      || (typeof window !== 'undefined' ? sessionStorage.getItem('telegramId') : null)
      || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('telegramId') : null);
  };

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
    if (isOpen) {
      console.log('[CreateListingFlow] Modal opened, starting with create_listing form');
      setStep('create_listing');
      setPendingListingData(null);
      setCreatedListingId(null);
    } else {
      console.log('[CreateListingFlow] Modal closed, resetting state');
      setStep('create_listing');
      setPendingListingData(null);
      setCreatedListingId(null);
    }
  }, [isOpen]);

  const checkIfNeedPackage = async (): Promise<boolean> => {
    try {
      const telegramId = getTelegramId();

      if (!telegramId) {
        console.error('[CreateListingFlow] No telegramId available');
        return false;
      }

      console.log('[CreateListingFlow] Checking if user needs to buy package, telegramId:', telegramId);

      const [settingsRes, balanceRes] = await Promise.all([
        fetch('/api/settings/public'),
        fetch(`/api/user/balance?telegramId=${telegramId}`)
      ]);

      if (!settingsRes.ok || !balanceRes.ok) {
        console.error('[CreateListingFlow] Failed to fetch settings or balance');
        return false;
      }

      const settings = await settingsRes.json();
      const balance = await balanceRes.json();
      
      const isPaidEnabled = settings.settings?.paidListingsEnabled || false;
      const hasUsedFree = balance.hasUsedFreeAd || false;
      const packagesBalance = balance.listingPackagesBalance || 0;

      console.log('[CreateListingFlow] User status:', {
        isPaidEnabled,
        hasUsedFree,
        packagesBalance,
      });

      setUserStatus({
        hasUsedFreeAd: hasUsedFree,
        listingPackagesBalance: packagesBalance,
        paidListingsEnabled: isPaidEnabled,
      });

      // Зберігаємо баланс користувача
      setUserBalance(balance.balance || 0);

      // Перевіряємо, чи потрібно купити пакет
      // Потрібно купити якщо: оплати ввімкнені, не перше оголошення і немає пакетів
      const needsPackage = isPaidEnabled && hasUsedFree && packagesBalance <= 0;
      
      console.log('[CreateListingFlow] Needs package:', needsPackage);
      return needsPackage;
    } catch (error) {
      console.error('[CreateListingFlow] Error checking user status:', error);
      return false;
    }
  };

  const handlePackageSelect = async (packageType: string) => {
    console.log('[CreateListingFlow] Package selected:', packageType);
    setSelectedPackageType(packageType);
    
    // Переходимо до вибору промо (без оплати поки що)
    setStep('select_promotion');
  };

  const handleCreateListing = async (data: any) => {
    try {
      const telegramId = getTelegramId();
      if (!telegramId) {
        console.error('[CreateListingFlow] No telegramId available for creating listing');
        showToast(t('common.error'), 'error');
        return;
      }

      console.log('[CreateListingFlow] User submitted listing form, checking if package needed...');
      
      // Зберігаємо дані оголошення
      setPendingListingData(data);
      
      // Перевіряємо, чи потрібно купити пакет
      const needsPackage = await checkIfNeedPackage();
      
      if (needsPackage) {
        // Показуємо вікно купівлі пакету
        console.log('[CreateListingFlow] Package needed, showing buy_package modal');
        console.log('[CreateListingFlow] Setting step to buy_package, NOT closing modal');
        showToast('Потрібно придбати пакет оголошень', 'info');
        setStep('buy_package');
        console.log('[CreateListingFlow] Step set to buy_package, exiting handleCreateListing');
        return;
      }

      // Якщо пакет не потрібен, переходимо до вибору промо
      console.log('[CreateListingFlow] Package not needed, showing promotion selection...');
      setStep('select_promotion');
    } catch (error: any) {
      console.error('[CreateListingFlow] Error in handleCreateListing:', error);
      showToast(error.message || t('common.error'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
    }
  };

  const createListingWithData = async (data: any, telegramId: string, promotionType: string | null, paymentMethod: 'balance' | 'direct' = 'balance') => {
    try {
      setLoading(true);
      console.log('[CreateListingFlow] Creating listing with promotion:', promotionType, 'payment method:', paymentMethod);
      
      const formData = new FormData();
      formData.append('telegramId', telegramId);
      formData.append('title', data.title);
      formData.append('description', data.description);
      formData.append('price', data.price);
      formData.append('currency', data.currency);
      formData.append('isFree', data.isFree.toString());
      formData.append('category', data.category);
      formData.append('subcategory', data.subcategory || '');
      formData.append('location', data.location);
      formData.append('condition', data.condition);

      data.images.forEach((image: File) => {
        formData.append('images', image);
      });

      const response = await fetch('/api/listings/create', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      console.log('[CreateListingFlow] Create listing response:', result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create listing');
      }

      const listingId = result.listingId;
      console.log('[CreateListingFlow] Listing created successfully, ID:', listingId);

      // Якщо обрано промо, застосовуємо його
      if (promotionType) {
        console.log('[CreateListingFlow] Applying promotion:', promotionType, 'with method:', paymentMethod);
        const needsPayment = await applyPromotion(listingId, promotionType, telegramId, paymentMethod);
        
        // Якщо потрібна оплата через Monobank, зупиняємо флоу і чекаємо на оплату
        if (needsPayment) {
          console.log('[CreateListingFlow] Waiting for payment, stopping flow');
          showToast('Оголошення створено. Завершіть оплату реклами в боті.', 'info');
          onClose();
          return;
        }
        
        // Після успішної оплати реклами з балансу, статус вже змінився на pending_moderation
        // Відправляємо на модерацію через API
        console.log('[CreateListingFlow] Promotion paid from balance, submitting to moderation');
        await submitToModeration(listingId, telegramId);
      } else {
        // Якщо реклама не обрана, оголошення вже створене зі статусом pending_moderation
        // Відправляємо на модерацію через API
        console.log('[CreateListingFlow] No promotion selected, submitting to moderation');
        await submitToModeration(listingId, telegramId);
      }

      // Успіх!
      showToast(t('createListing.listingCreated'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('[CreateListingFlow] Error creating listing:', error);
      showToast(error.message || t('common.error'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  const applyPromotion = async (listingId: number, promotionType: string, telegramId: string, paymentMethod: 'balance' | 'direct'): Promise<boolean> => {
    try {
      console.log('[CreateListingFlow] Applying promotion - START', { listingId, promotionType, telegramId, paymentMethod });
      
      const requestBody = {
        telegramId,
        listingId,
        promotionType,
        paymentMethod,
      };
      
      console.log('[CreateListingFlow] Request body:', requestBody);

      const response = await fetch('/api/listings/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('[CreateListingFlow] Response status:', response.status, response.ok);

      const data = await response.json();
      console.log('[CreateListingFlow] Response data:', data);

      if (!response.ok) {
        console.error('[CreateListingFlow] Failed to apply promotion - ERROR:', data);
        showToast(data.error || 'Помилка застосування промо', 'error');
        tg?.HapticFeedback.notificationOccurred('error');
        throw new Error(data.error || 'Failed to apply promotion'); // КРИТИЧНО: Кидаємо помилку, щоб зупинити флоу
      }

      console.log('[CreateListingFlow] Promotion applied successfully');
      console.log('[CreateListingFlow] Checking payment requirements:', {
        paymentRequired: data.paymentRequired,
        hasPageUrl: !!data.pageUrl,
        pageUrl: data.pageUrl
      });
      
      // Якщо потрібна оплата через Monobank, редіректимо на сторінку оплати
      if (data.paymentRequired && data.pageUrl) {
        console.log('[CreateListingFlow] ✅ PAYMENT REQUIRED - Redirecting to payment page:', data.pageUrl);
        
        // Використовуємо той самий метод, що й TopUpBalanceModal
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('payments.paymentInfo'), 'info');
        
        // Перенаправляємо на сторінку оплати
        window.location.href = data.pageUrl;
        
        console.log('[CreateListingFlow] ✅ RETURNING TRUE - Should stop flow');
        return true; // Зупиняємо флоу - чекаємо на оплату
      }
      
      console.log('[CreateListingFlow] No payment required, continuing flow');
      return false; // Оплата пройшла успішно з балансу, продовжуємо
    } catch (error) {
      console.error('[CreateListingFlow] CRITICAL Error applying promotion:', error);
      throw error; // Перекидаємо помилку вище, щоб зупинити весь флоу
    }
  };

  const submitToModeration = async (listingId: number, telegramId: string) => {
    const response = await fetch(`/api/listings/${listingId}/submit-moderation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to submit listing for moderation');
    }

    console.log('[CreateListingFlow] Listing submitted to moderation successfully');
  };

  const handlePromotionSelect = async (promotionType: string | null) => {
    console.log('[CreateListingFlow] Promotion selected:', promotionType);
    setSelectedPromotionType(promotionType);
    
    // Якщо обрано промо, показуємо фінальне вікно оплати
    if (promotionType) {
      setStep('payment_summary');
    } else {
      // Якщо промо не обрано, одразу створюємо оголошення без реклами
      const telegramId = getTelegramId();
      if (pendingListingData && telegramId) {
        console.log('[CreateListingFlow] No promotion selected, creating listing without ads');
        await createListingWithData(pendingListingData, telegramId, null);
      }
    }
  };

  const handlePaymentConfirm = async (paymentMethod: 'balance' | 'direct') => {
    const telegramId = getTelegramId();
    if (!telegramId || !pendingListingData) {
      showToast(t('common.error'), 'error');
      return;
    }

    // Зберігаємо обраний метод оплати
    setSelectedPaymentMethod(paymentMethod);

    try {
      // Спочатку оплачуємо пакет (якщо потрібен)
      if (selectedPackageType) {
        console.log('[CreateListingFlow] Purchasing package:', selectedPackageType, 'method:', paymentMethod);
        const packageRes = await fetch('/api/listings/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId,
            packageType: selectedPackageType,
            paymentMethod,
          }),
        });

        const packageData = await packageRes.json();

        if (!packageRes.ok) {
          throw new Error(packageData.error || 'Failed to purchase package');
        }

        if (packageData.paymentRequired && packageData.pageUrl) {
          // Використовуємо той самий метод, що й TopUpBalanceModal
          tg?.HapticFeedback.notificationOccurred('success');
          showToast(t('payments.paymentInfo'), 'info');
          
          // Перенаправляємо на сторінку оплати
          window.location.href = packageData.pageUrl;
          return;
        }
      }

      // Створюємо оголошення з обраною промо та методом оплати
      await createListingWithData(pendingListingData, telegramId, selectedPromotionType, paymentMethod);
    } catch (error: any) {
      console.error('[CreateListingFlow] Error in payment flow:', error);
      showToast(error.message || t('payments.purchaseError'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
    }
  };

  console.log('[CreateListingFlow] Render check - isOpen:', isOpen, 'loading:', loading, 'step:', step);

  if (!isOpen) {
    console.log('[CreateListingFlow] Not rendering - modal is closed');
    return null;
  }

  // Показуємо лоадер тільки якщо йде завантаження
  if (loading) {
    console.log('[CreateListingFlow] Showing loading screen');
    return (
      <div 
        className="fixed inset-0 z-[70] flex items-center justify-center"
        style={{
          background: 'radial-gradient(ellipse 80% 100% at 20% 0%, rgba(63, 83, 49, 0.15) 0%, transparent 40%), radial-gradient(ellipse 80% 100% at 80% 100%, rgba(63, 83, 49, 0.15) 0%, transparent 40%), #000000'
        }}
      >
        <div className="text-center px-6">
          {/* Елегантний спіннер */}
          <div className="relative w-14 h-14 mx-auto mb-6">
            {/* Фон кільце */}
            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(63, 83, 49, 0.1)' }}></div>
            {/* Анімоване кільце з градієнтом */}
            <div 
              className="absolute inset-0 rounded-full animate-spin"
              style={{ 
                border: '2px solid transparent',
                borderTop: '2px solid #D3F1A7',
                borderRight: '2px solid rgba(211, 241, 167, 0.3)',
                animationDuration: '1s',
                animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            ></div>
          </div>
          
          {/* Текст завантаження */}
          <p className="text-base font-medium text-white/95 mb-0.5">
            {t('createListing.creating') || 'Створення...'}
          </p>
          <p className="text-xs text-white/40 font-light">
            {t('common.loading')}
          </p>
        </div>
      </div>
    );
  }

  console.log('[CreateListingFlow] Rendering, current step:', step);

  return (
    <>
      {step === 'buy_package' && (
        <ListingPackageModal
          isOpen={true}
          onClose={onClose}
          onSelectPackage={(packageType) => handlePackageSelect(packageType)}
          telegramId={getTelegramId() || undefined}
        />
      )}

      {step === 'create_listing' && (
        <CreateListingModal
          isOpen={true}
          onClose={onClose}
          onSave={handleCreateListing}
          tg={tg}
        />
      )}

      {step === 'select_promotion' && (
        <PromotionModal
          isOpen={true}
          onClose={() => {
            // Якщо закриває без вибору - створюємо без промо
            const telegramId = getTelegramId();
            if (pendingListingData && telegramId) {
              createListingWithData(pendingListingData, telegramId, null);
            }
          }}
          onSelectPromotion={handlePromotionSelect}
          listingId={null}
          telegramId={getTelegramId() || undefined}
        />
      )}

      {step === 'payment_summary' && (
        <PaymentSummaryModal
          isOpen={true}
          onClose={onClose}
          onConfirm={handlePaymentConfirm}
          packageType={selectedPackageType}
          promotionType={selectedPromotionType}
          userBalance={userBalance}
          tg={tg}
        />
      )}
    </>
  );
}

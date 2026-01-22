'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/useToast';

// Динамічні імпорти для оптимізації
const ListingPackageModal = dynamic(() => import('./ListingPackageModal'), { ssr: false });
const PromotionModal = dynamic(() => import('./PromotionModal'), { ssr: false });
const PaymentSummaryModal = dynamic(() => import('./PaymentSummaryModal').then(mod => ({ default: mod.PaymentSummaryModal })), { ssr: false });

interface ReactivateListingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  listingId: number;
  tg: TelegramWebApp | null;
  onSuccess?: () => void;
}

type Step = 'buy_package' | 'select_promotion' | 'payment_summary' | 'reactivating';

interface UserStatus {
  hasUsedFreeAd: boolean;
  listingPackagesBalance: number;
  paidListingsEnabled: boolean;
}

export default function ReactivateListingFlow({ isOpen, onClose, listingId, tg, onSuccess }: ReactivateListingFlowProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('buy_package');
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [loading, setLoading] = useState(false);
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
      console.log('[ReactivateListingFlow] Modal opened, checking if package needed');
      checkIfNeedPackage();
    } else {
      console.log('[ReactivateListingFlow] Modal closed, resetting state');
      setStep('buy_package');
      setSelectedPackageType(null);
      setSelectedPromotionType(null);
    }
  }, [isOpen]);

  const checkIfNeedPackage = async (): Promise<boolean> => {
    try {
      const telegramId = getTelegramId();

      if (!telegramId) {
        console.error('[ReactivateListingFlow] No telegramId available');
        return false;
      }

      console.log('[ReactivateListingFlow] Checking if user needs to buy package, telegramId:', telegramId);

      const [settingsRes, balanceRes] = await Promise.all([
        fetch('/api/settings/public'),
        fetch(`/api/user/balance?telegramId=${telegramId}`)
      ]);

      if (!settingsRes.ok || !balanceRes.ok) {
        console.error('[ReactivateListingFlow] Failed to fetch settings or balance');
        return false;
      }

      const settings = await settingsRes.json();
      const balance = await balanceRes.json();
      
      const isPaidEnabled = settings.settings?.paidListingsEnabled || false;
      const hasUsedFree = balance.hasUsedFreeAd || false;
      const packagesBalance = balance.listingPackagesBalance || 0;

      console.log('[ReactivateListingFlow] User status:', {
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
      const needsPackage = isPaidEnabled && hasUsedFree && packagesBalance <= 0;
      
      console.log('[ReactivateListingFlow] Needs package:', needsPackage);
      
      if (needsPackage) {
        setStep('buy_package');
      } else {
        // Якщо пакет не потрібен, одразу переходимо до вибору промо
        setStep('select_promotion');
      }
      
      return needsPackage;
    } catch (error) {
      console.error('[ReactivateListingFlow] Error checking user status:', error);
      return false;
    }
  };

  const handlePackageSelect = async (packageType: string) => {
    console.log('[ReactivateListingFlow] Package selected:', packageType);
    setSelectedPackageType(packageType);
    
    // Переходимо до вибору промо
    setStep('select_promotion');
  };

  const applyPromotion = async (promotionType: string, telegramId: string, paymentMethod: 'balance' | 'direct'): Promise<boolean> => {
    try {
      console.log('[ReactivateListingFlow] Applying promotion - START', { listingId, promotionType, telegramId, paymentMethod });
      
      const requestBody = {
        telegramId,
        listingId,
        promotionType,
        paymentMethod,
      };
      
      console.log('[ReactivateListingFlow] Request body:', requestBody);

      const response = await fetch('/api/listings/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('[ReactivateListingFlow] Response status:', response.status, response.ok);

      const data = await response.json();
      console.log('[ReactivateListingFlow] Response data:', data);

      if (!response.ok) {
        console.error('[ReactivateListingFlow] Failed to apply promotion - ERROR:', data);
        showToast(data.error || 'Помилка застосування промо', 'error');
        tg?.HapticFeedback.notificationOccurred('error');
        throw new Error(data.error || 'Failed to apply promotion');
      }

      console.log('[ReactivateListingFlow] Promotion applied successfully');
      console.log('[ReactivateListingFlow] Checking payment requirements:', {
        paymentRequired: data.paymentRequired,
        hasPageUrl: !!data.pageUrl,
        pageUrl: data.pageUrl
      });
      
      // Якщо потрібна оплата через Monobank, редіректимо на сторінку оплати
      if (data.paymentRequired && data.pageUrl) {
        console.log('[ReactivateListingFlow] ✅ PAYMENT REQUIRED - Redirecting to payment page:', data.pageUrl);
        
        tg?.HapticFeedback.notificationOccurred('success');
        showToast(t('payments.paymentInfo'), 'info');
        
        // Закриваємо мінідодаток перед редиректом на оплату
        try {
          if (tg?.close) {
            console.log('[ReactivateListingFlow] Closing WebApp before redirect');
            tg.close();
          }
        } catch (e) {
          console.error('[ReactivateListingFlow] Error closing WebApp:', e);
        }
        
        // Перенаправляємо на сторінку оплати
        if (tg?.openLink) {
          console.log('[ReactivateListingFlow] Using tg.openLink for redirect');
          tg.openLink(data.pageUrl);
        } else {
          console.log('[ReactivateListingFlow] Using window.location.href for redirect');
          window.location.href = data.pageUrl;
        }
        
        console.log('[ReactivateListingFlow] ✅ RETURNING TRUE - Should stop flow');
        return true; // Зупиняємо флоу - чекаємо на оплату
      }
      
      console.log('[ReactivateListingFlow] No payment required, continuing flow');
      return false; // Оплата пройшла успішно з балансу, продовжуємо
    } catch (error) {
      console.error('[ReactivateListingFlow] CRITICAL Error applying promotion:', error);
      throw error;
    }
  };

  const submitToModeration = async (telegramId: string) => {
    try {
      const response = await fetch(`/api/listings/${listingId}/submit-moderation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to submit listing for moderation';
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch (e) {
          // Якщо не вдалося парсити JSON, використовуємо текст помилки
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Перевіряємо, чи є контент для парсингу
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          console.log('[ReactivateListingFlow] Listing submitted to moderation successfully:', data);
        } catch (e) {
          console.log('[ReactivateListingFlow] Listing submitted to moderation (no JSON response)');
        }
      } else {
        console.log('[ReactivateListingFlow] Listing submitted to moderation successfully');
      }
    } catch (error) {
      console.error('[ReactivateListingFlow] Error submitting to moderation:', error);
      throw error;
    }
  };

  const reactivateListingWithData = async (telegramId: string, promotionType: string | null, paymentMethod: 'balance' | 'direct' = 'balance') => {
    try {
      setLoading(true);
      console.log('[ReactivateListingFlow] Reactivating listing with promotion:', promotionType, 'payment method:', paymentMethod);
      
      // Показуємо індикатор завантаження одразу
      tg?.HapticFeedback.impactOccurred('light');
      
      // Спочатку оплачуємо пакет (якщо потрібен)
      if (selectedPackageType) {
        console.log('[ReactivateListingFlow] Purchasing package:', selectedPackageType, 'method:', paymentMethod);
        
        // Показуємо індикатор завантаження при списанні коштів
        if (paymentMethod === 'balance') {
          showToast(t('payments.processing') || 'Обробка платежу...', 'info');
        }
        
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
          tg?.HapticFeedback.notificationOccurred('success');
          showToast(t('payments.paymentInfo'), 'info');
          
          // Закриваємо мінідодаток перед редиректом на оплату
          try {
            if (tg?.close) {
              console.log('[ReactivateListingFlow] Closing WebApp before redirect');
              tg.close();
            }
          } catch (e) {
            console.error('[ReactivateListingFlow] Error closing WebApp:', e);
          }
          
          // Перенаправляємо на сторінку оплати
          if (tg?.openLink) {
            tg.openLink(packageData.pageUrl);
          } else {
            window.location.href = packageData.pageUrl;
          }
          return;
        }
      }

      // Показуємо індикатор завантаження при списанні коштів за реактивацію
      if (paymentMethod === 'balance') {
        showToast(t('payments.processing') || 'Списання коштів з балансу...', 'info');
      }

      // Реактивуємо оголошення
      const reactivateResponse = await fetch(`/api/listings/${listingId}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId,
          withPromotion: false, // Промо застосуємо окремо
          promotionType: null,
        }),
      });

      // Перевіряємо статус перед парсингом JSON
      if (!reactivateResponse.ok) {
        let errorMessage = 'Failed to reactivate listing';
        try {
          const reactivateResult = await reactivateResponse.json();
          errorMessage = reactivateResult.error || errorMessage;
        } catch (e) {
          const text = await reactivateResponse.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Парсимо JSON тільки якщо відповідь успішна
      let reactivateResult;
      try {
        reactivateResult = await reactivateResponse.json();
      } catch (e) {
        console.error('[ReactivateListingFlow] Failed to parse reactivate response:', e);
        throw new Error('Invalid response from server');
      }

      console.log('[ReactivateListingFlow] Listing reactivated successfully:', reactivateResult);

      // Якщо обрано промо, застосовуємо його
      if (promotionType) {
        console.log('[ReactivateListingFlow] Applying promotion:', promotionType, 'with method:', paymentMethod);
        
        // Показуємо індикатор завантаження при списанні коштів за рекламу
        if (paymentMethod === 'balance') {
          showToast(t('payments.processing') || 'Списання коштів за рекламу...', 'info');
        }
        
        const needsPayment = await applyPromotion(promotionType, telegramId, paymentMethod);
        
        // Якщо потрібна оплата, зупиняємо флоу і чекаємо на оплату
        if (needsPayment) {
          console.log('[ReactivateListingFlow] Waiting for payment, stopping flow');
          showToast('Оголошення реактивовано. Завершіть оплату реклами в боті.', 'info');
          onClose();
          return;
        }
      }

      // Відправляємо на модерацію
      console.log('[ReactivateListingFlow] Submitting to moderation');
      try {
        await submitToModeration(telegramId);
      } catch (modError: any) {
        console.error('[ReactivateListingFlow] Error submitting to moderation:', modError);
        // Якщо помилка при відправці на модерацію, все одно закриваємо вікно
        // Оголошення вже реактивовано, просто не відправлено в групу
        showToast(t('editListing.listingReactivated') || 'Оголошення реактивовано', 'success');
        tg?.HapticFeedback.notificationOccurred('success');
        onSuccess?.();
        onClose();
        return;
      }

      // Успіх!
      showToast(t('editListing.listingReactivated'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('[ReactivateListingFlow] Error reactivating listing:', error);
      showToast(error.message || t('common.error'), 'error');
      tg?.HapticFeedback.notificationOccurred('error');
      // Закриваємо вікно навіть при помилці, щоб користувач міг спробувати знову
      setTimeout(() => {
        onClose();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handlePromotionSelect = async (promotionType: string | null, paymentMethod?: 'balance' | 'direct') => {
    console.log('[ReactivateListingFlow] Promotion selected:', promotionType, 'paymentMethod:', paymentMethod);
    
    // Якщо promotionType === null, це означає що користувач натиснув "Пропустити"
    // Перевіряємо telegramId перед будь-якими діями
    const telegramId = getTelegramId();
    if (!telegramId) {
      console.error('[ReactivateListingFlow] No telegramId available');
      showToast(t('common.error') || 'Помилка: не вдалося отримати ID користувача', 'error');
      tg?.HapticFeedback.notificationOccurred('error');
      return;
    }
    
    setSelectedPromotionType(promotionType);
    
    // Якщо обрано промо, показуємо фінальне вікно оплати
    if (promotionType) {
      setStep('payment_summary');
    } else {
      // Якщо промо не обрано (натиснуто "Пропустити"), одразу реактивуємо без реклами
      console.log('[ReactivateListingFlow] No promotion selected, reactivating without ads');
      await reactivateListingWithData(telegramId, null, paymentMethod || 'balance');
    }
  };

  const handlePaymentConfirm = async (paymentMethod: 'balance' | 'direct') => {
    const telegramId = getTelegramId();
    if (!telegramId) {
      showToast(t('common.error'), 'error');
      return;
    }

    // Зберігаємо обраний метод оплати
    setSelectedPaymentMethod(paymentMethod);

    // Реактивуємо з обраною промо та методом оплати
    await reactivateListingWithData(telegramId, selectedPromotionType, paymentMethod);
  };

  console.log('[ReactivateListingFlow] Render check - isOpen:', isOpen, 'loading:', loading, 'step:', step);

  if (!isOpen) {
    console.log('[ReactivateListingFlow] Not rendering - modal is closed');
    return null;
  }

  // Показуємо лоадер тільки якщо йде завантаження
  if (loading) {
    console.log('[ReactivateListingFlow] Showing loading screen');
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
            {t('editListing.listingReactivated') || 'Реактивація...'}
          </p>
          <p className="text-xs text-white/40 font-light">
            {t('common.loading')}
          </p>
        </div>
      </div>
    );
  }

  console.log('[ReactivateListingFlow] Rendering, current step:', step);

  return (
    <>
      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99999] flex items-center justify-center">
          <div className="bg-[#000000] rounded-2xl border-2 border-white p-6 max-w-sm w-full mx-4">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-[#D3F1A7] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-white text-center font-medium">
                {t('payments.processing') || 'Обробка платежу...'}
              </p>
              <p className="text-white/70 text-sm text-center">
                {t('payments.pleaseWait') || 'Будь ласка, зачекайте'}
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 'buy_package' && (
        <ListingPackageModal
          isOpen={true}
          onClose={onClose}
          onSelectPackage={(packageType) => handlePackageSelect(packageType)}
          telegramId={getTelegramId() || undefined}
        />
      )}

      {step === 'select_promotion' && (
        <PromotionModal
          isOpen={true}
          onClose={() => {
            // Просто закриваємо модальне вікно без реактивації
            // Користувач може закрити вікно, не вибравши промо
            onClose();
          }}
          onSelectPromotion={handlePromotionSelect}
          listingId={listingId}
          telegramId={getTelegramId() || undefined}
          // Показуємо кнопку "Пропустити", яка викличе реактивацію без промо
          showSkipButton={true}
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

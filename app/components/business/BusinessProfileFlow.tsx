'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { X, Upload, Check, ChevronLeft, MapPin, Phone, Image as ImageIcon, Package, AlertCircle } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useToast } from '@/features/ui/hooks/useToast';
import { Toast } from '@/components/ui/Toast';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { resolvePaymentTelegramId } from '@/utils/paymentTelegramId';
import {
  clearBusinessWizardState,
  loadBusinessWizardState,
  saveBusinessWizardState,
  type StoredBusinessWizardForm,
  type BusinessWizardStep,
} from '@/lib/businessProfileWizardStorage';
import { getCategories } from '@/constants/categories';
import { majorGermanCities } from '@/constants/major-german-cities';
import { BUSINESS_PLANS, type BusinessPlanId, type ServiceArea } from '@/lib/businessProfileConstants';
import { Listing } from '@/types';
import { getResolvedImageUrl, compressImageOnClient } from '@/utils/imageUtils';
import { BusinessBetaBadge } from '@/components/business/BusinessBetaBadge';
import { BusinessBrandIcon } from '@/components/business/BusinessBrandIcon';

const PaymentSummaryModal = dynamic(
  () => import('@/components/modals/PaymentSummaryModal').then((m) => ({ default: m.PaymentSummaryModal })),
  { ssr: false }
);

type WizardStep = 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'preview' | 'tariff' | 'payment';

interface BusinessProfileFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tg: TelegramWebApp | null;
  telegramId: string;
  defaultTelegram?: string;
  defaultPhone?: string;
  renewMode?: boolean;
  editMode?: boolean;
  existingProfile?: {
    businessName?: string;
    category?: string;
    subcategory?: string | null;
    description?: string;
    city?: string;
    address?: string | null;
    serviceArea?: string;
    serviceRadiusKm?: number | null;
    telegram?: string | null;
    phone?: string | null;
    instagram?: string | null;
    website?: string | null;
    workingHours?: string | null;
    logo?: string | null;
    coverImage?: string | null;
    linkedListingIds?: string | null;
    plan?: string | null;
    updatedAt?: string;
  } | null;
}

interface FormState {
  businessName: string;
  category: string;
  subcategory: string;
  description: string;
  logoFile: File | null;
  logoPreview: string | null;
  city: string;
  address: string;
  serviceArea: ServiceArea;
  serviceRadiusKm: string;
  telegram: string;
  phone: string;
  instagram: string;
  website: string;
  coverFile: File | null;
  coverPreview: string | null;
  workingHours: string;
  selectedListingIds: number[];
  selectedPlan: BusinessPlanId | null;
  savedLogoPath: string | null;
  savedCoverPath: string | null;
}

const initialForm = (defaults: { telegram?: string; phone?: string }): FormState => ({
  businessName: '',
  category: '',
  subcategory: '',
  description: '',
  logoFile: null,
  logoPreview: null,
  city: '',
  address: '',
  serviceArea: 'city_only',
  serviceRadiusKm: '25',
  telegram: defaults.telegram || '',
  phone: defaults.phone || '',
  instagram: '',
  website: '',
  coverFile: null,
  coverPreview: null,
  workingHours: '',
  selectedListingIds: [],
  selectedPlan: null,
  savedLogoPath: null,
  savedCoverPath: null,
});

const formToStored = (form: FormState): StoredBusinessWizardForm => ({
  businessName: form.businessName,
  category: form.category,
  subcategory: form.subcategory,
  description: form.description,
  city: form.city,
  address: form.address,
  serviceArea: form.serviceArea,
  serviceRadiusKm: form.serviceRadiusKm,
  telegram: form.telegram,
  phone: form.phone,
  instagram: form.instagram,
  website: form.website,
  workingHours: form.workingHours,
  selectedListingIds: form.selectedListingIds,
  selectedPlan: form.selectedPlan,
  savedLogoPath: form.savedLogoPath,
  savedCoverPath: form.savedCoverPath,
  logoPreview: form.logoPreview?.startsWith('blob:') ? form.savedLogoPath : form.logoPreview,
  coverPreview: form.coverPreview?.startsWith('blob:') ? form.savedCoverPath : form.coverPreview,
});

const storedToForm = (
  stored: StoredBusinessWizardForm,
  defaults: { telegram?: string; phone?: string }
): FormState => ({
  ...stored,
  logoFile: null,
  coverFile: null,
  telegram: stored.telegram || defaults.telegram || '',
  phone: stored.phone || defaults.phone || '',
  logoPreview: stored.logoPreview || stored.savedLogoPath,
  coverPreview: stored.coverPreview || stored.savedCoverPath,
});

const restoreStep = (savedStep: BusinessWizardStep): WizardStep =>
  savedStep === 'payment' ? 'tariff' : savedStep;

type ImageUploadBoxProps = {
  preview: string | null;
  resolveSrc: (src: string | null) => string;
  onPick: (file: File | null) => void;
  emptyLabel: string;
  changeLabel: string;
  emptyIcon: ReactNode;
  variant?: 'logo' | 'cover';
  isLight: boolean;
};

function ImageUploadBox({
  preview,
  resolveSrc,
  onPick,
  emptyLabel,
  changeLabel,
  emptyIcon,
  variant = 'logo',
  isLight,
}: ImageUploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLogo = variant === 'logo';
  const borderCls = isLight ? 'border-gray-300 bg-gray-50' : 'border-white/20 bg-white/[0.04]';
  const boxCls = isLogo
    ? 'mx-auto h-36 w-36 rounded-[1.35rem]'
    : 'w-full aspect-[16/9] rounded-[1.35rem]';

  return (
    <div className={`relative overflow-hidden border-2 border-dashed ${boxCls} ${borderCls}`}>
      {preview ? (
        <>
          <img
            src={resolveSrc(preview)}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain p-2"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex touch-manipulation items-end justify-center bg-gradient-to-t from-black/50 via-transparent to-transparent pb-2.5"
          >
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
              {changeLabel}
            </span>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex touch-manipulation flex-col items-center justify-center gap-1.5 px-3"
        >
          {emptyIcon}
          <span className="px-2 text-center text-sm leading-snug opacity-70">{emptyLabel}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; details?: string };
    if (data.error === 'FILE_TOO_LARGE' || res.status === 413) return fallback;
    const msg = [data.error, data.details].filter(Boolean).join(' — ');
    return msg || `${fallback} (${res.status})`;
  } catch {
    if (res.status === 413) return fallback;
    return `${fallback} (${res.status})`;
  }
}

export default function BusinessProfileFlow({
  isOpen,
  onClose,
  onSuccess,
  tg,
  telegramId,
  defaultTelegram = '',
  defaultPhone = '',
  renewMode = false,
  editMode = false,
  existingProfile = null,
}: BusinessProfileFlowProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const { toast, showToast, hideToast } = useToast();
  const categories = useMemo(() => getCategories(t), [t]);
  const [step, setStep] = useState<WizardStep>('step1');
  const [form, setForm] = useState<FormState>(() => initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const openedRef = useRef(false);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const uploadingRef = useRef(false);

  const paymentTelegramId = useMemo(
    () => resolvePaymentTelegramId(tg, telegramId) || telegramId,
    [tg, telegramId]
  );

  useHideBottomNav(isOpen);
  useBodyScrollLock(isOpen);

  const saveDraftToLocal = useCallback(
    (currentStep: WizardStep, currentForm: FormState) => {
      if (renewMode || editMode || !paymentTelegramId) return;
      saveBusinessWizardState(paymentTelegramId, {
        step: currentStep,
        form: formToStored(currentForm),
        savedAt: Date.now(),
      });
    },
    [paymentTelegramId, renewMode, editMode]
  );

  const saveDraftToServer = useCallback(
    async (currentForm: FormState): Promise<{ logo?: string; coverImage?: string } | null> => {
      if (renewMode || !paymentTelegramId) return null;
      if (editMode && !currentForm.logoFile && !currentForm.coverFile) return null;

      const hasAnyData = [
        currentForm.businessName,
        currentForm.category,
        currentForm.description,
        currentForm.city,
        currentForm.telegram,
        currentForm.phone,
        currentForm.instagram,
        currentForm.website,
      ].some((value) => value.trim());

      if (
        !hasAnyData &&
        !currentForm.savedLogoPath &&
        !currentForm.savedCoverPath &&
        !currentForm.logoFile &&
        !currentForm.coverFile
      ) {
        return null;
      }

      try {
        let res: Response;
        if (currentForm.logoFile || currentForm.coverFile) {
          const fd = new FormData();
          fd.append('partial', 'true');
          fd.append('telegramId', paymentTelegramId);
          fd.append('businessName', currentForm.businessName);
          fd.append('category', currentForm.category);
          fd.append('subcategory', currentForm.subcategory);
          fd.append('description', currentForm.description);
          fd.append('city', currentForm.city);
          fd.append('address', currentForm.address);
          fd.append('serviceArea', currentForm.serviceArea);
          if (currentForm.serviceRadiusKm) fd.append('serviceRadiusKm', currentForm.serviceRadiusKm);
          fd.append('telegram', currentForm.telegram);
          fd.append('phone', currentForm.phone);
          fd.append('instagram', currentForm.instagram);
          fd.append('website', currentForm.website);
          fd.append('workingHours', currentForm.workingHours);
          if (currentForm.selectedPlan) fd.append('plan', currentForm.selectedPlan);
          fd.append('listingIds', JSON.stringify(currentForm.selectedListingIds));
          if (currentForm.logoFile) fd.append('logo', currentForm.logoFile);
          if (currentForm.coverFile) fd.append('coverImage', currentForm.coverFile);
          res = await fetch('/api/user/business-profile', { method: 'PUT', body: fd });
        } else {
          res = await fetch('/api/user/business-profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              partial: true,
              telegramId: paymentTelegramId,
              businessName: currentForm.businessName,
              category: currentForm.category,
              subcategory: currentForm.subcategory,
              description: currentForm.description,
              city: currentForm.city,
              address: currentForm.address,
              serviceArea: currentForm.serviceArea,
              serviceRadiusKm:
                currentForm.serviceArea === 'city_radius' ? currentForm.serviceRadiusKm : null,
              telegram: currentForm.telegram,
              phone: currentForm.phone,
              instagram: currentForm.instagram,
              website: currentForm.website,
              workingHours: currentForm.workingHours,
              plan: currentForm.selectedPlan,
              listingIds: currentForm.selectedListingIds,
              ...(currentForm.savedLogoPath ? { logo: currentForm.savedLogoPath } : {}),
              ...(currentForm.savedCoverPath ? { coverImage: currentForm.savedCoverPath } : {}),
            }),
          });
        }
        const payloadText = await res.text();
        let data: { profile?: { logo?: string | null; coverImage?: string | null }; error?: string; details?: string } | null =
          null;
        try {
          data = payloadText ? JSON.parse(payloadText) : null;
        } catch {
          data = null;
        }
        if (!res.ok) {
          if (data?.error === 'FILE_TOO_LARGE' || res.status === 413) {
            throw new Error(t('businessProfile.validation.photoTooLarge'));
          }
          const message =
            [data?.error, data?.details].filter(Boolean).join(' — ') ||
            `${t('businessProfile.validation.photoUploadFailed')} (${res.status})`;
          throw new Error(message);
        }
        return {
          logo: data?.profile?.logo || undefined,
          coverImage: data?.profile?.coverImage || undefined,
        };
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error;
        }
        return null;
      }
    },
    [paymentTelegramId, renewMode, editMode, t]
  );

  const applySavedMedia = useCallback(
    (saved: { logo?: string; coverImage?: string } | null, currentStep: WizardStep, currentForm: FormState) => {
      if (!saved?.logo && !saved?.coverImage) return currentForm;
      const nextLogo = saved.logo || currentForm.savedLogoPath;
      const nextCover = saved.coverImage || currentForm.savedCoverPath;
      const samePaths =
        nextLogo === currentForm.savedLogoPath && nextCover === currentForm.savedCoverPath;
      const filesCleared = !currentForm.logoFile && !currentForm.coverFile;
      if (samePaths && filesCleared) return currentForm;

      const next: FormState = {
        ...currentForm,
        savedLogoPath: nextLogo,
        savedCoverPath: nextCover,
        logoPreview: saved.logo || currentForm.logoPreview,
        coverPreview: saved.coverImage || currentForm.coverPreview,
        logoFile: saved.logo ? null : currentForm.logoFile,
        coverFile: saved.coverImage ? null : currentForm.coverFile,
      };
      setForm(next);
      saveDraftToLocal(currentStep, next);
      return next;
    },
    [saveDraftToLocal]
  );

  const handleClose = useCallback(() => {
    if (!renewMode && !editMode) {
      saveDraftToLocal(step, form);
      void saveDraftToServer(form).then((saved) => {
        if (!saved) return;
        saveDraftToLocal(step, {
          ...form,
          savedLogoPath: saved.logo || form.savedLogoPath,
          savedCoverPath: saved.coverImage || form.savedCoverPath,
          logoPreview: saved.logo || form.logoPreview,
          coverPreview: saved.coverImage || form.coverPreview,
          logoFile: null,
          coverFile: null,
        });
      }).catch(() => null);
    }
    onClose();
  }, [form, onClose, renewMode, editMode, saveDraftToLocal, saveDraftToServer, step]);

  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false;
      setStep('step1');
      setForm(initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
      setFlowError(null);
      return;
    }

    if (openedRef.current) return;
    openedRef.current = true;

    const prefillFromExisting = (profile: NonNullable<BusinessProfileFlowProps['existingProfile']>) => {
      const linkedIds = (() => {
        try {
          const parsed = JSON.parse(profile.linkedListingIds || '[]') as unknown;
          return Array.isArray(parsed)
            ? parsed.map((id) => parseInt(String(id), 10)).filter((id) => Number.isFinite(id))
            : [];
        } catch {
          return [];
        }
      })();
      return {
        ...initialForm({ telegram: defaultTelegram, phone: defaultPhone }),
        businessName: profile.businessName || '',
        category: profile.category || '',
        subcategory: profile.subcategory || '',
        description: profile.description || '',
        city: profile.city || '',
        address: profile.address || '',
        serviceArea: (profile.serviceArea as ServiceArea) || 'city_only',
        serviceRadiusKm: profile.serviceRadiusKm ? String(profile.serviceRadiusKm) : '25',
        telegram: profile.telegram || defaultTelegram,
        phone: profile.phone || defaultPhone,
        instagram: profile.instagram || '',
        website: profile.website || '',
        workingHours: profile.workingHours || '',
        logoPreview: profile.logo || null,
        coverPreview: profile.coverImage || null,
        savedLogoPath: profile.logo || null,
        savedCoverPath: profile.coverImage || null,
        selectedListingIds: linkedIds,
        selectedPlan: (profile.plan as BusinessPlanId) || null,
      };
    };

    if (editMode && existingProfile) {
      setForm(prefillFromExisting(existingProfile));
      setStep('step1');
    } else if (renewMode && existingProfile) {
      setForm(prefillFromExisting(existingProfile));
      setStep('tariff');
    } else {
      const localDraft = loadBusinessWizardState(paymentTelegramId);
      const serverTime = existingProfile?.updatedAt
        ? new Date(existingProfile.updatedAt).getTime()
        : 0;
      const useLocalDraft = Boolean(localDraft && (!serverTime || localDraft.savedAt > serverTime));

      const mergePhotos = (base: FormState): FormState => ({
        ...base,
        savedLogoPath: base.savedLogoPath || existingProfile?.logo || null,
        savedCoverPath: base.savedCoverPath || existingProfile?.coverImage || null,
        logoPreview: base.logoPreview || existingProfile?.logo || null,
        coverPreview: base.coverPreview || existingProfile?.coverImage || null,
      });

      if (useLocalDraft && localDraft) {
        setForm(mergePhotos(storedToForm(localDraft.form, { telegram: defaultTelegram, phone: defaultPhone })));
        setStep(restoreStep(localDraft.step));
      } else if (existingProfile?.businessName || existingProfile?.logo || existingProfile?.coverImage) {
        setForm(prefillFromExisting(existingProfile));
        setStep(existingProfile.businessName ? 'step1' : 'step1');
      } else {
        setStep('step1');
        setForm(initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
      }
    }
  }, [isOpen, defaultTelegram, defaultPhone, renewMode, editMode, existingProfile, paymentTelegramId]);

  useEffect(() => {
    if (!isOpen || renewMode || editMode || uploadingRef.current) return;
    const timer = setTimeout(() => {
      if (uploadingRef.current) return;
      saveDraftToLocal(step, form);
      void saveDraftToServer(form)
        .then((saved) => applySavedMedia(saved, step, form))
        .catch(() => null);
    }, 800);
    return () => clearTimeout(timer);
  }, [isOpen, renewMode, editMode, step, form, saveDraftToLocal, saveDraftToServer, applySavedMedia]);

  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0 });
    setCityQuery('');
    setCityPickerOpen(step === 'step2');
  }, [step]);

  useEffect(() => {
    if (!isOpen || step !== 'step5') return;
    fetch(`/api/listings?userId=${paymentTelegramId}&viewerId=${paymentTelegramId}&limit=50&offset=0`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setUserListings(data.listings || []))
      .catch(() => setUserListings([]));
  }, [isOpen, step, paymentTelegramId]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/user/balance?telegramId=${paymentTelegramId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUserBalance(Number(data?.balance) || 0))
      .catch(() => {});
  }, [isOpen, paymentTelegramId]);

  const stepNumber = useMemo(() => {
    const map: Record<WizardStep, number | null> = {
      step1: 1, step2: 2, step3: 3, step4: 4, step5: 5,
      preview: null, tariff: null, payment: null,
    };
    return map[step];
  }, [step]);

  const subcategories = useMemo(() => {
    return categories.find((c) => c.id === form.category)?.subcategories || [];
  }, [categories, form.category]);

  const patch = (partial: Partial<FormState>) => {
    setFlowError(null);
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const previewSrc = (src: string | null) => {
    if (!src) return '';
    if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) return src;
    return getResolvedImageUrl(src);
  };

  const inputCls = isLight
    ? 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400'
    : 'w-full rounded-xl border border-white/15 bg-[#1C1C1C] px-4 py-3 text-white placeholder:text-white/40';

  const labelCls = isLight ? 'text-sm font-medium text-gray-700 mb-1.5 block' : 'text-sm font-medium text-white/80 mb-1.5 block';

  const primaryBtnClass = isLight
    ? 'w-full py-3.5 rounded-2xl font-semibold bg-[#3F5331] text-white hover:bg-[#344728] disabled:opacity-50 transition-colors'
    : 'w-full py-3.5 rounded-2xl font-semibold bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0] disabled:opacity-50 transition-colors shadow-[0_0_20px_rgba(200,230,160,0.25)]';

  const getStepValidationError = (s: WizardStep): string | null => {
    if (s === 'step1') {
      const hasLogo = Boolean(form.logoFile || form.logoPreview || form.savedLogoPath);
      if (!form.businessName.trim()) return t('businessProfile.validation.businessName');
      if (!form.category) return t('businessProfile.validation.category');
      if (!form.subcategory) return t('businessProfile.validation.subcategory');
      if (!form.description.trim()) return t('businessProfile.validation.description');
      if (!hasLogo) return t('businessProfile.validation.logo');
    }
    if (s === 'step2') {
      if (!form.city.trim()) return t('businessProfile.validation.cityRequired');
      if (form.serviceArea === 'city_radius' && !form.serviceRadiusKm.trim()) {
        return t('businessProfile.validation.radiusRequired');
      }
    }
    if (s === 'step3') {
      const hasContact = [form.telegram, form.phone, form.instagram, form.website].some((v) => v.trim());
      if (!hasContact) return t('businessProfile.validation.contactRequired');
    }
    if (s === 'tariff' && !form.selectedPlan) return t('businessProfile.validation.planRequired');
    return null;
  };

  const validateStep = (s: WizardStep): boolean => {
    const err = getStepValidationError(s);
    if (err) {
      setFlowError(err);
      showToast(err, 'error');
      tg?.HapticFeedback?.notificationOccurred('error');
      return false;
    }
    setFlowError(null);
    return true;
  };

  const goNext = () => {
    const order: WizardStep[] = ['step1', 'step2', 'step3', 'step4', 'step5', 'preview', 'tariff', 'payment'];
    const idx = order.indexOf(step);
    if (idx < 0 || idx >= order.length - 1) return;
    if (!validateStep(step)) return;
    if (step === 'step5' && userListings.length === 0) {
      setStep('preview');
      saveDraftToLocal('preview', form);
      void saveDraftToServer(form).catch(() => null);
      return;
    }
    const nextStep = order[idx + 1];
    setStep(nextStep);
    saveDraftToLocal(nextStep, form);
    void saveDraftToServer(form).catch(() => null);
    tg?.HapticFeedback.impactOccurred('light');
  };

  const goBack = () => {
    setFlowError(null);
    const order: WizardStep[] = ['step1', 'step2', 'step3', 'step4', 'step5', 'preview', 'tariff', 'payment'];
    const idx = order.indexOf(step);
    if (idx <= 0) return;
    setStep(order[idx - 1]);
  };

  const uploadDraft = useCallback(async (): Promise<{ logo?: string; coverImage?: string }> => {
    const fd = new FormData();
    fd.append('telegramId', paymentTelegramId);
    fd.append('businessName', form.businessName);
    fd.append('category', form.category);
    fd.append('subcategory', form.subcategory);
    fd.append('description', form.description);
    fd.append('city', form.city);
    fd.append('address', form.address);
    fd.append('serviceArea', form.serviceArea);
    if (form.serviceRadiusKm) fd.append('serviceRadiusKm', form.serviceRadiusKm);
    fd.append('telegram', form.telegram);
    fd.append('phone', form.phone);
    fd.append('instagram', form.instagram);
    fd.append('website', form.website);
    fd.append('workingHours', form.workingHours);
    if (form.logoFile) fd.append('logo', form.logoFile);
    if (form.coverFile) fd.append('coverImage', form.coverFile);

    const res = await fetch('/api/user/business-profile', { method: 'PUT', body: fd });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return {
      logo: data.profile?.logo || form.savedLogoPath || undefined,
      coverImage: data.profile?.coverImage || form.savedCoverPath || undefined,
    };
  }, [form, paymentTelegramId]);

  const handleEditSave = async () => {
    const requiredSteps: WizardStep[] = ['step1', 'step2', 'step3'];
    for (const s of requiredSteps) {
      if (!validateStep(s)) {
        setStep(s);
        return;
      }
    }

    setLoading(true);
    setFlowError(null);
    try {
      const hasNewFiles = Boolean(form.logoFile || form.coverFile);
      let res: Response;
      if (hasNewFiles) {
        const fd = new FormData();
        fd.append('telegramId', paymentTelegramId);
        fd.append('businessName', form.businessName);
        fd.append('category', form.category);
        fd.append('subcategory', form.subcategory);
        fd.append('description', form.description);
        fd.append('city', form.city);
        fd.append('address', form.address);
        fd.append('serviceArea', form.serviceArea);
        if (form.serviceRadiusKm) fd.append('serviceRadiusKm', form.serviceRadiusKm);
        fd.append('telegram', form.telegram);
        fd.append('phone', form.phone);
        fd.append('instagram', form.instagram);
        fd.append('website', form.website);
        fd.append('workingHours', form.workingHours);
        fd.append('listingIds', JSON.stringify(form.selectedListingIds));
        if (form.logoFile) fd.append('logo', form.logoFile);
        if (form.coverFile) fd.append('coverImage', form.coverFile);
        res = await fetch('/api/user/business-profile', { method: 'PUT', body: fd });
      } else {
        res = await fetch('/api/user/business-profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegramId: paymentTelegramId,
            businessName: form.businessName,
            category: form.category,
            subcategory: form.subcategory,
            description: form.description,
            city: form.city,
            address: form.address,
            serviceArea: form.serviceArea,
            serviceRadiusKm: form.serviceArea === 'city_radius' ? form.serviceRadiusKm : null,
            telegram: form.telegram,
            phone: form.phone,
            instagram: form.instagram,
            website: form.website,
            workingHours: form.workingHours,
            listingIds: form.selectedListingIds,
            ...(form.savedLogoPath ? { logo: form.savedLogoPath } : {}),
            ...(form.savedCoverPath ? { coverImage: form.savedCoverPath } : {}),
          }),
        });
      }

      if (!res.ok) {
        const tooLargeFallback = t('businessProfile.validation.photoTooLarge');
        const message = await readApiError(
          res,
          res.status === 413 ? tooLargeFallback : t('businessProfile.validation.photoUploadFailed')
        );
        setFlowError(message);
        showToast(message, 'error');
        return;
      }

      showToast(t('businessProfile.updated'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error && e.message
          ? e.message
          : t('businessProfile.validation.photoUploadFailed');
      setFlowError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (paymentMethod: 'balance' | 'direct') => {
    if (!form.selectedPlan) return;
    setLoading(true);
    try {
      let paths = {
        logo: form.savedLogoPath || undefined,
        coverImage: form.savedCoverPath || undefined,
      };

      if (!renewMode) {
        const uploaded = await uploadDraft();
        paths = {
          logo: uploaded.logo || form.savedLogoPath || undefined,
          coverImage: uploaded.coverImage || form.savedCoverPath || undefined,
        };
        patch({ savedLogoPath: paths.logo || null, savedCoverPath: paths.coverImage || null });
      }

      const payload = renewMode
        ? {
            telegramId: paymentTelegramId,
            plan: form.selectedPlan,
            paymentMethod,
            renew: true,
            listingIds: form.selectedListingIds,
          }
        : {
            telegramId: paymentTelegramId,
            plan: form.selectedPlan,
            paymentMethod,
            listingIds: form.selectedListingIds,
            businessName: form.businessName,
            category: form.category,
            subcategory: form.subcategory,
            description: form.description,
            city: form.city,
            address: form.address,
            serviceArea: form.serviceArea,
            serviceRadiusKm: form.serviceArea === 'city_radius' ? form.serviceRadiusKm : null,
            telegram: form.telegram,
            phone: form.phone,
            instagram: form.instagram,
            website: form.website,
            workingHours: form.workingHours,
            logo: paths.logo,
            coverImage: paths.coverImage,
          };

      const res = await fetch('/api/user/business-profile/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || t('common.error'), 'error');
        return;
      }

      if (paymentMethod === 'direct' && data.pageUrl) {
        window.location.href = data.pageUrl;
        return;
      }

      showToast(t('businessProfile.success'), 'success');
      tg?.HapticFeedback.notificationOccurred('success');
      clearBusinessWizardState(paymentTelegramId);
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      showToast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredCities = useMemo(() => {
    const query = cityQuery.trim().toLowerCase();
    const list = query
      ? majorGermanCities.filter((city) => city.toLowerCase().includes(query))
      : majorGermanCities;
    return list.slice(0, 16);
  }, [cityQuery]);

  const handleImagePick = async (file: File | null, kind: 'logo' | 'cover') => {
    if (!file) return;
    setFlowError(null);

    let prepared = file;
    try {
      prepared = await compressImageOnClient(file, kind === 'logo' ? 1.2 : 2);
    } catch (compressError) {
      console.warn('[BusinessProfile] compress failed', compressError);
      const type = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      const looksHeic = type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
      if (looksHeic || file.size > 6 * 1024 * 1024) {
        const msg = looksHeic
          ? t('businessProfile.validation.photoUnsupported')
          : t('businessProfile.validation.photoTooLarge');
        setFlowError(msg);
        showToast(msg, 'error');
        return;
      }
    }

    const preview = URL.createObjectURL(prepared);
    const next =
      kind === 'logo'
        ? { logoFile: prepared, logoPreview: preview }
        : { coverFile: prepared, coverPreview: preview };
    const merged = { ...form, ...next };
    setForm(merged);

    uploadingRef.current = true;
    try {
      const saved = await saveDraftToServer(merged);
      applySavedMedia(saved, step, merged);
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      const msg =
        !raw || /failed to fetch|networkerror|load failed/i.test(raw)
          ? t('businessProfile.validation.photoUploadFailed')
          : raw;
      setFlowError(msg);
      showToast(msg, 'error');
    } finally {
      uploadingRef.current = false;
    }
  };

  const toggleListing = (id: number) => {
    patch({
      selectedListingIds: form.selectedListingIds.includes(id)
        ? form.selectedListingIds.filter((x) => x !== id)
        : [...form.selectedListingIds, id],
    });
  };

  if (!isOpen) return null;

  const shell = isLight ? 'bg-white text-gray-900' : 'bg-[#0a0a0a] text-white';
  const headerBorder = isLight ? 'border-gray-200' : 'border-white/10';
  const wizardSteps: WizardStep[] = ['step1', 'step2', 'step3', 'step4', 'step5'];
  const wizardIndex = wizardSteps.indexOf(step);
  const showWizardProgress = wizardIndex >= 0;

  const accentIcon = isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]';

  const renderBusinessIcon = (iconSize = 22) => (
    <BusinessBrandIcon size={iconSize} className={accentIcon} />
  );

  const renderStepHeader = (title: string, icon: React.ReactNode) => (
    <div className="mb-5">
      {stepNumber != null && (
        <p className={`text-xs uppercase tracking-wide mb-2 ${isLight ? 'text-gray-500' : 'text-white/45'}`}>
          {t('businessProfile.stepOf').replace('{current}', String(stepNumber)).replace('{total}', '5')}
        </p>
      )}
      <div className="flex items-center gap-2.5">
        <div className="flex shrink-0 items-center justify-center">{icon}</div>
        <h2 className={`text-xl font-bold ${ac.pageHeading}`}>{title}</h2>
      </div>
    </div>
  );

  const continueLabel =
    editMode && step === 'preview'
      ? t('common.save')
      : step === 'step5'
      ? t('businessProfile.preview.continue')
      : step === 'preview'
        ? t('businessProfile.preview.toTariff')
        : `${t('businessProfile.continue')} →`;

  const handleContinue = () => {
    if (editMode && step === 'preview') {
      void handleEditSave();
      return;
    }
    if (step === 'tariff') {
      if (!validateStep('tariff')) return;
      setStep('payment');
      tg?.HapticFeedback?.impactOccurred('light');
      return;
    }
    goNext();
  };

  return (
    <>
      <div className="fixed inset-0 z-[99990] flex flex-col justify-end">
        <button
          type="button"
          aria-label={t('common.close')}
          className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          onClick={handleClose}
        />

        <div
          className={`relative z-10 flex flex-col w-full max-h-[min(92dvh,720px)] rounded-t-[1.75rem] overflow-hidden shadow-2xl ${shell}`}
        >
          <div
            className={`shrink-0 flex items-center justify-between px-4 py-3 border-b ${headerBorder} pt-[max(0.75rem,env(safe-area-inset-top))]`}
          >
            <button
              type="button"
              onClick={step === 'step1' || (renewMode && step === 'tariff') ? handleClose : goBack}
              className={`p-2 -ml-2 rounded-full ${isLight ? 'hover:bg-gray-100' : 'hover:bg-white/10'}`}
            >
              {step === 'step1' || (renewMode && step === 'tariff') ? <X size={22} /> : <ChevronLeft size={22} />}
            </button>
            <span className="flex items-center gap-1.5 font-semibold text-sm">
              <BusinessBrandIcon size={20} className={accentIcon} />
              <span>{editMode ? t('businessProfile.editTitle') : renewMode ? t('businessProfile.suspended.renewTitle') : 'TradeGround Business'}</span>
              <BusinessBetaBadge />
            </span>
            <div className="w-10" />
          </div>

          {showWizardProgress && (
            <div className={`shrink-0 px-4 py-3 border-b ${headerBorder}`}>
              <div className="flex items-center gap-1.5">
                {wizardSteps.map((s, i) => {
                  const done = i < wizardIndex;
                  const active = i === wizardIndex;
                  return (
                    <div key={s} className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <div
                        className={`h-1.5 rounded-full transition-colors ${
                          done || active
                            ? isLight
                              ? 'bg-[#3F5331]'
                              : 'bg-[#C8E6A0]'
                            : isLight
                              ? 'bg-gray-200'
                              : 'bg-white/10'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {flowError && (
            <div
              className={`mx-4 mt-3 shrink-0 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                isLight ? 'bg-red-50 border-red-200 text-red-800' : 'bg-red-500/10 border-red-400/30 text-red-200'
              }`}
            >
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{flowError}</p>
            </div>
          )}

          <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 pb-8">
          {step === 'step1' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step1.title'), renderBusinessIcon())}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.logo')} *</label>
                  <ImageUploadBox
                    preview={form.logoPreview}
                    resolveSrc={previewSrc}
                    onPick={(file) => handleImagePick(file, 'logo')}
                    emptyLabel={t('businessProfile.fields.uploadLogo')}
                    changeLabel={t('businessProfile.fields.changePhoto')}
                    emptyIcon={<Upload size={22} className="opacity-60" />}
                    variant="logo"
                    isLight={isLight}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.businessName')} *</label>
                  <input className={inputCls} value={form.businessName} onChange={(e) => patch({ businessName: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.category')} *</label>
                  <select className={inputCls} value={form.category} onChange={(e) => patch({ category: e.target.value, subcategory: '' })}>
                    <option value="">{t('businessProfile.fields.selectCategory')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.subcategory')} *</label>
                  <select className={inputCls} value={form.subcategory} onChange={(e) => patch({ subcategory: e.target.value })} disabled={!form.category}>
                    <option value="">{t('businessProfile.fields.selectSubcategory')}</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.description')} *</label>
                  <textarea className={`${inputCls} min-h-[100px] resize-none`} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {step === 'step2' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step2.title'), <MapPin size={22} className={accentIcon} />)}
              <div className="space-y-5">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.city')} *</label>
                  {form.city ? (
                    <button
                      type="button"
                      onClick={() => {
                        patch({ city: '' });
                        setCityQuery('');
                        setCityPickerOpen(true);
                      }}
                      className={`mb-2 flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left ${
                        isLight ? 'border-[#3F5331]/30 bg-[#3F5331]/5' : 'border-[#C8E6A0]/30 bg-white/5'
                      }`}
                    >
                      <MapPin size={18} className={accentIcon} />
                      <span className="flex-1 font-medium">{form.city}</span>
                      <span className={`text-xs ${ac.mutedText}`}>{t('businessProfile.fields.searchCity')}</span>
                    </button>
                  ) : (
                    <input
                      className={inputCls}
                      value={cityQuery}
                      placeholder={t('businessProfile.fields.searchCity')}
                      onFocus={() => setCityPickerOpen(true)}
                      onChange={(e) => {
                        setCityQuery(e.target.value);
                        setCityPickerOpen(true);
                      }}
                    />
                  )}
                  {!form.city && cityPickerOpen && (
                    <div
                      className={`mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border ${
                        isLight ? 'border-gray-200 bg-white' : 'border-white/15 bg-[#141414]'
                      }`}
                    >
                      {filteredCities.length === 0 ? (
                        <p className={`px-4 py-3 text-sm ${ac.mutedText}`}>{t('businessProfile.fields.selectCity')}</p>
                      ) : (
                        filteredCities.map((city) => (
                          <button
                            type="button"
                            key={city}
                            onClick={() => {
                              patch({ city });
                              setCityQuery('');
                              setCityPickerOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm touch-manipulation ${
                              isLight ? 'hover:bg-gray-50' : 'hover:bg-white/5'
                            }`}
                          >
                            <MapPin size={16} className={accentIcon} />
                            {city}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.address')}</label>
                  <input
                    className={inputCls}
                    value={form.address}
                    placeholder={t('businessProfile.fields.addressPlaceholder')}
                    onChange={(e) => patch({ address: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.serviceArea')}</label>
                  <div className="space-y-2">
                    {(['city_only', 'city_radius', 'all_germany'] as ServiceArea[]).map((area) => {
                      const selected = form.serviceArea === area;
                      return (
                        <button
                          type="button"
                          key={area}
                          onClick={() => patch({ serviceArea: area })}
                          className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left touch-manipulation ${
                            selected
                              ? isLight
                                ? 'border-[#3F5331] bg-[#3F5331]/8'
                                : 'border-[#C8E6A0]/60 bg-white/8'
                              : isLight
                                ? 'border-gray-200 bg-white'
                                : 'border-white/15 bg-white/[0.03]'
                          }`}
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? isLight
                                  ? 'border-[#3F5331] bg-[#3F5331] text-white'
                                  : 'border-[#C8E6A0] bg-[#C8E6A0] text-[#141414]'
                                : isLight
                                  ? 'border-gray-300'
                                  : 'border-white/30'
                            }`}
                          >
                            {selected ? <Check size={12} strokeWidth={3} /> : null}
                          </span>
                          <span>
                            <span className="block text-sm font-medium">{t(`businessProfile.serviceArea.${area}`)}</span>
                            <span className={`mt-0.5 block text-xs ${ac.mutedText}`}>
                              {t(`businessProfile.serviceArea.${area}Hint`)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {form.serviceArea === 'city_radius' && (
                  <div>
                    <label className={labelCls}>{t('businessProfile.fields.radiusKm')}</label>
                    <div className="mb-2 flex gap-2">
                      {['10', '25', '50', '100'].map((km) => (
                        <button
                          type="button"
                          key={km}
                          onClick={() => patch({ serviceRadiusKm: km })}
                          className={`flex-1 rounded-xl border py-2 text-sm font-medium touch-manipulation ${
                            form.serviceRadiusKm === km
                              ? isLight
                                ? 'border-[#3F5331] bg-[#3F5331] text-white'
                                : 'border-[#C8E6A0] bg-[#C8E6A0] text-[#141414]'
                              : isLight
                                ? 'border-gray-200'
                                : 'border-white/15'
                          }`}
                        >
                          {km}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputCls}
                      value={form.serviceRadiusKm}
                      onChange={(e) => patch({ serviceRadiusKm: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'step3' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step3.title'), <Phone size={22} className={accentIcon} />)}
              <p className={`text-sm mb-4 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.steps.step3.subtitle')}</p>
              <div className="space-y-4">
                {(['telegram', 'phone', 'instagram', 'website'] as const).map((field) => (
                  <div key={field}>
                    <label className={labelCls}>{t(`businessProfile.fields.${field}`)}</label>
                    <input className={inputCls} value={form[field]} onChange={(e) => patch({ [field]: e.target.value })} />
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 'step4' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step4.title'), <ImageIcon size={22} className={accentIcon} />)}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.coverImage')}</label>
                  <ImageUploadBox
                    preview={form.coverPreview}
                    resolveSrc={previewSrc}
                    onPick={(file) => handleImagePick(file, 'cover')}
                    emptyLabel={t('businessProfile.fields.uploadCover')}
                    changeLabel={t('businessProfile.fields.changePhoto')}
                    emptyIcon={<ImageIcon size={22} className="opacity-60" />}
                    variant="cover"
                    isLight={isLight}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.workingHours')}</label>
                  <textarea className={`${inputCls} min-h-[80px] resize-none`} placeholder={t('businessProfile.fields.workingHoursPlaceholder')} value={form.workingHours} onChange={(e) => patch({ workingHours: e.target.value })} />
                </div>
              </div>
            </>
          )}

          {step === 'step5' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step5.title'), <Package size={22} className={accentIcon} />)}
              <p className={`text-sm mb-4 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.steps.step5.subtitle')}</p>
              <div className="space-y-2">
                {userListings.length === 0 ? (
                  <div className={`rounded-2xl border p-6 text-center ${isLight ? 'border-gray-200 bg-gray-50' : 'border-white/15 bg-white/5'}`}>
                    <Package size={28} className={`mx-auto mb-2 ${isLight ? 'text-gray-400' : 'text-white/40'}`} />
                    <p className={`text-sm ${ac.mutedText}`}>{t('businessProfile.steps.step5.empty')}</p>
                  </div>
                ) : (
                  userListings.map((listing) => {
                  const checked = form.selectedListingIds.includes(listing.id);
                  const thumb = listing.images?.[0] || listing.image || '';
                  return (
                    <label
                      key={listing.id}
                      className={`flex min-h-[3.75rem] cursor-pointer touch-manipulation items-center gap-3 rounded-2xl border p-2.5 ${
                        checked
                          ? isLight
                            ? 'border-[#3F5331] bg-[#3F5331]/5'
                            : 'border-[#C8E6A0]/50 bg-white/5'
                          : isLight
                            ? 'border-gray-200'
                            : 'border-white/15'
                      }`}
                    >
                      <div
                        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ${
                          isLight ? 'bg-gray-100' : 'bg-white/10'
                        }`}
                      >
                        {thumb ? (
                          <img
                            src={getResolvedImageUrl(thumb)}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon size={18} className={`m-auto mt-4 opacity-40`} />
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleListing(listing.id)}
                        className="h-5 w-5 shrink-0 rounded accent-[#3F5331]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{listing.title}</p>
                        <p className={`text-xs truncate ${isLight ? 'text-gray-500' : 'text-white/50'}`}>{listing.location}</p>
                      </div>
                    </label>
                  );
                })
                )}
              </div>
              <p className={`text-xs mt-3 ${isLight ? 'text-gray-500' : 'text-white/45'}`}>{t('businessProfile.steps.step5.hint')}</p>
            </>
          )}

          {step === 'preview' && (
            <>
              {renderStepHeader(t('businessProfile.preview.title'), renderBusinessIcon())}
              <p className={`text-sm mb-5 -mt-2 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.preview.subtitle')}</p>
              <div className={`overflow-hidden rounded-2xl border ${isLight ? 'border-gray-200' : 'border-white/15'}`}>
                <div className="relative h-36 overflow-hidden bg-[#3F5331]/20">
                  {form.coverPreview ? (
                    <img src={previewSrc(form.coverPreview)} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <div className={`h-full w-full ${isLight ? 'bg-[#3F5331]/15' : 'bg-[#3F5331]/25'}`} />
                  )}
                  <div
                    className={`absolute -bottom-8 left-4 h-16 w-16 overflow-hidden rounded-xl border-4 ${
                      isLight ? 'border-white bg-white' : 'border-[#0a0a0a] bg-[#1C1C1C]'
                    }`}
                  >
                    {form.logoPreview ? (
                      <img src={previewSrc(form.logoPreview)} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold bg-[#3F5331]/30 text-[#C8E6A0]">
                        {form.businessName.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-12 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{form.businessName}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#3F5331] text-white">BUSINESS</span>
                  </div>
                  <p className={`text-sm ${isLight ? 'text-gray-600' : 'text-white/70'}`}>{form.description}</p>
                  <p className="text-sm">{form.city}{form.address ? `, ${form.address}` : ''}</p>
                </div>
              </div>
            </>
          )}

          {step === 'tariff' && (
            <>
              <div className="mb-5">
                <h2 className={`text-xl font-bold mb-1 ${ac.pageHeading}`}>{t('businessProfile.tariff.title')}</h2>
                <p className={`text-sm ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.tariff.subtitle')}</p>
              </div>
              <div className="space-y-4">
                {(Object.keys(BUSINESS_PLANS) as BusinessPlanId[]).map((planId) => {
                  const plan = BUSINESS_PLANS[planId];
                  const selected = form.selectedPlan === planId;
                  const features = t(plan.featuresKey).split('\n').filter(Boolean);
                  return (
                    <button
                      key={planId}
                      type="button"
                      onClick={() => patch({ selectedPlan: planId })}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                        selected
                          ? isLight ? 'border-[#3F5331] bg-[#3F5331]/5' : 'border-[#C8E6A0]/60 bg-white/5'
                          : isLight ? 'border-gray-200' : 'border-white/15'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold">{t(plan.labelKey)}</span>
                        <span className="font-bold text-[#C8E6A0]">{plan.price.toFixed(2)} € / {t('businessProfile.tariff.month')}</span>
                      </div>
                      <p className={`text-sm mb-3 ${isLight ? 'text-gray-600' : 'text-white/65'}`}>
                        {t(`businessProfile.plans.${planId === 'business_pro' ? 'businessPro' : 'business'}.tagline`)}
                      </p>
                      <ul className="space-y-1">
                        {features.map((f) => (
                          <li key={f} className="text-sm flex gap-2"><Check size={14} className="shrink-0 mt-0.5 text-emerald-400" />{f}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
              <p className={`text-xs mt-4 ${isLight ? 'text-gray-500' : 'text-white/45'}`}>{t('businessProfile.tariff.disclaimer')}</p>
            </>
          )}
          </div>

          {step !== 'payment' && (
            <div
              className={`shrink-0 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${headerBorder} ${shell}`}
            >
              <button type="button" onClick={handleContinue} disabled={loading} className={primaryBtnClass}>
                {loading && editMode && step === 'preview'
                  ? t('common.saving')
                  : step === 'tariff'
                    ? t('businessProfile.continue')
                    : continueLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
        layerClassName="fixed inset-x-0 top-[max(4.5rem,env(safe-area-inset-top))] z-[100002] flex justify-center px-3 pointer-events-none animate-slide-down"
      />

      <PaymentSummaryModal
        isOpen={step === 'payment'}
        onClose={() => setStep('tariff')}
        onConfirm={handlePayment}
        businessPlan={form.selectedPlan}
        userBalance={userBalance}
        telegramId={paymentTelegramId}
        tg={tg}
      />
    </>
  );
}

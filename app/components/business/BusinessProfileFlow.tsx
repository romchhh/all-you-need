'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Upload, Check, ChevronLeft, Briefcase, MapPin, Phone, Image as ImageIcon, Package } from 'lucide-react';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { useToast } from '@/features/ui/hooks/useToast';
import { getCategories } from '@/constants/categories';
import { majorGermanCities } from '@/constants/major-german-cities';
import { BUSINESS_PLANS, type BusinessPlanId, type ServiceArea } from '@/lib/businessProfileConstants';
import { Listing } from '@/types';
import { getResolvedImageUrl } from '@/utils/imageUtils';

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

export default function BusinessProfileFlow({
  isOpen,
  onClose,
  onSuccess,
  tg,
  telegramId,
  defaultTelegram = '',
  defaultPhone = '',
  renewMode = false,
  existingProfile = null,
}: BusinessProfileFlowProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const { showToast } = useToast();
  const categories = useMemo(() => getCategories(t), [t]);
  const [step, setStep] = useState<WizardStep>('step1');
  const [form, setForm] = useState<FormState>(() => initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(0);

  useHideBottomNav(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setStep('step1');
      setForm(initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
      return;
    }

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

    if (renewMode && existingProfile) {
      setForm(prefillFromExisting(existingProfile));
      setStep('tariff');
    } else if (existingProfile?.businessName) {
      setForm(prefillFromExisting(existingProfile));
      setStep('step1');
    } else {
      setStep('step1');
      setForm(initialForm({ telegram: defaultTelegram, phone: defaultPhone }));
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, defaultTelegram, defaultPhone, renewMode, existingProfile?.businessName, existingProfile?.updatedAt]);

  useEffect(() => {
    if (!isOpen || step !== 'step5') return;
    fetch(`/api/listings?userId=${telegramId}&viewerId=${telegramId}&limit=50&offset=0`)
      .then((r) => (r.ok ? r.json() : { listings: [] }))
      .then((data) => setUserListings(data.listings || []))
      .catch(() => setUserListings([]));
  }, [isOpen, step, telegramId]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/user/balance?telegramId=${telegramId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUserBalance(Number(data?.balance) || 0))
      .catch(() => {});
  }, [isOpen, telegramId]);

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

  const patch = (partial: Partial<FormState>) => setForm((prev) => ({ ...prev, ...partial }));

  const previewSrc = (src: string | null) => {
    if (!src) return '';
    if (src.startsWith('blob:') || src.startsWith('http://') || src.startsWith('https://')) return src;
    return getResolvedImageUrl(src);
  };

  const inputCls = isLight
    ? 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400'
    : 'w-full rounded-xl border border-white/15 bg-[#1C1C1C] px-4 py-3 text-white placeholder:text-white/40';

  const labelCls = isLight ? 'text-sm font-medium text-gray-700 mb-1.5 block' : 'text-sm font-medium text-white/80 mb-1.5 block';

  const validateStep = (s: WizardStep): boolean => {
    if (s === 'step1') {
      const hasLogo = Boolean(form.logoFile || form.logoPreview || form.savedLogoPath);
      if (!form.businessName.trim() || !form.category || !form.subcategory || !form.description.trim() || !hasLogo) {
        showToast(t('businessProfile.validation.required'), 'error');
        return false;
      }
    }
    if (s === 'step2') {
      if (!form.city.trim()) {
        showToast(t('businessProfile.validation.cityRequired'), 'error');
        return false;
      }
      if (form.serviceArea === 'city_radius' && !form.serviceRadiusKm.trim()) {
        showToast(t('businessProfile.validation.radiusRequired'), 'error');
        return false;
      }
    }
    if (s === 'step3') {
      const hasContact = [form.telegram, form.phone, form.instagram, form.website].some((v) => v.trim());
      if (!hasContact) {
        showToast(t('businessProfile.validation.contactRequired'), 'error');
        return false;
      }
    }
    if (s === 'tariff' && !form.selectedPlan) {
      showToast(t('businessProfile.validation.planRequired'), 'error');
      return false;
    }
    return true;
  };

  const goNext = () => {
    const order: WizardStep[] = ['step1', 'step2', 'step3', 'step4', 'step5', 'preview', 'tariff', 'payment'];
    const idx = order.indexOf(step);
    if (idx < 0 || idx >= order.length - 1) return;
    if (!validateStep(step)) return;
    if (step === 'step5' && userListings.length === 0) {
      setStep('preview');
      return;
    }
    setStep(order[idx + 1]);
    tg?.HapticFeedback.impactOccurred('light');
  };

  const goBack = () => {
    const order: WizardStep[] = ['step1', 'step2', 'step3', 'step4', 'step5', 'preview', 'tariff', 'payment'];
    const idx = order.indexOf(step);
    if (idx <= 0) return;
    setStep(order[idx - 1]);
  };

  const uploadDraft = useCallback(async (): Promise<{ logo?: string; coverImage?: string }> => {
    const fd = new FormData();
    fd.append('telegramId', telegramId);
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
  }, [form, telegramId]);

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
            telegramId,
            plan: form.selectedPlan,
            paymentMethod,
            renew: true,
            listingIds: form.selectedListingIds,
          }
        : {
            telegramId,
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
      onSuccess();
      onClose();
    } catch (e) {
      console.error(e);
      showToast(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImagePick = (file: File | null, kind: 'logo' | 'cover') => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (kind === 'logo') patch({ logoFile: file, logoPreview: preview });
    else patch({ coverFile: file, coverPreview: preview });
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

  const renderStepHeader = (title: string, icon: React.ReactNode) => (
    <div className="mb-6">
      {stepNumber != null && (
        <p className={`text-sm mb-1 ${isLight ? 'text-gray-500' : 'text-white/50'}`}>
          {t('businessProfile.stepOf').replace('{current}', String(stepNumber)).replace('{total}', '5')}
        </p>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
    </div>
  );

  const continueLabel =
    step === 'step5'
      ? t('businessProfile.preview.continue')
      : `${t('businessProfile.continue')} →`;

  const continueBtn = (
    <button
      type="button"
      onClick={goNext}
      className="w-full py-3.5 rounded-2xl font-semibold bg-[#3F5331] text-white hover:bg-[#344728] transition-colors"
    >
      {continueLabel}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-[99990] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`fixed inset-0 z-[99991] flex flex-col ${shell}`}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${headerBorder} shrink-0`}>
          <button type="button" onClick={step === 'step1' || (renewMode && step === 'tariff') ? onClose : goBack} className="p-2 -ml-2">
            {step === 'step1' || (renewMode && step === 'tariff') ? <X size={22} /> : <ChevronLeft size={22} />}
          </button>
          <span className="font-semibold text-sm">
            {renewMode ? t('businessProfile.suspended.renewTitle') : 'TradeGround Business'}
          </span>
          <div className="w-8" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">
          {step === 'step1' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step1.title'), <Briefcase size={22} className="text-[#C8E6A0]" />)}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.logo')} *</label>
                  <label className={`flex flex-col items-center justify-center h-28 rounded-2xl border-2 border-dashed cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50' : 'border-white/20 bg-white/5'}`}>
                    {form.logoPreview ? (
                      <img src={previewSrc(form.logoPreview)} alt="" className="h-full w-full object-contain rounded-2xl p-2" />
                    ) : (
                      <>
                        <Upload size={24} className="mb-1 opacity-60" />
                        <span className="text-sm opacity-70">{t('businessProfile.fields.uploadLogo')}</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0] || null, 'logo')} />
                  </label>
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
              {renderStepHeader(t('businessProfile.steps.step2.title'), <MapPin size={22} className="text-[#C8E6A0]" />)}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.city')} *</label>
                  <select className={inputCls} value={form.city} onChange={(e) => patch({ city: e.target.value })}>
                    <option value="">{t('businessProfile.fields.selectCity')}</option>
                    {majorGermanCities.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.address')}</label>
                  <input className={inputCls} value={form.address} onChange={(e) => patch({ address: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.serviceArea')}</label>
                  <div className="space-y-2">
                    {(['city_only', 'city_radius', 'all_germany'] as ServiceArea[]).map((area) => (
                      <label key={area} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${form.serviceArea === area ? (isLight ? 'border-[#3F5331] bg-[#3F5331]/5' : 'border-[#C8E6A0]/50 bg-white/5') : (isLight ? 'border-gray-200' : 'border-white/15')}`}>
                        <input type="radio" name="serviceArea" checked={form.serviceArea === area} onChange={() => patch({ serviceArea: area })} />
                        <span className="text-sm">{t(`businessProfile.serviceArea.${area}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {form.serviceArea === 'city_radius' && (
                  <div>
                    <label className={labelCls}>{t('businessProfile.fields.radiusKm')}</label>
                    <input type="number" className={inputCls} value={form.serviceRadiusKm} onChange={(e) => patch({ serviceRadiusKm: e.target.value })} />
                  </div>
                )}
              </div>
            </>
          )}

          {step === 'step3' && (
            <>
              {renderStepHeader(t('businessProfile.steps.step3.title'), <Phone size={22} className="text-[#C8E6A0]" />)}
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
              {renderStepHeader(t('businessProfile.steps.step4.title'), <ImageIcon size={22} className="text-[#C8E6A0]" />)}
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>{t('businessProfile.fields.coverImage')}</label>
                  <label className={`flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed cursor-pointer ${isLight ? 'border-gray-300 bg-gray-50' : 'border-white/20 bg-white/5'}`}>
                    {form.coverPreview ? (
                      <img src={previewSrc(form.coverPreview)} alt="" className="h-full w-full object-cover rounded-2xl" />
                    ) : (
                      <span className="text-sm opacity-70">{t('businessProfile.fields.uploadCover')}</span>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImagePick(e.target.files?.[0] || null, 'cover')} />
                  </label>
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
              {renderStepHeader(t('businessProfile.steps.step5.title'), <Package size={22} className="text-[#C8E6A0]" />)}
              <p className={`text-sm mb-4 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.steps.step5.subtitle')}</p>
              <div className="space-y-2">
                {userListings.map((listing) => {
                  const checked = form.selectedListingIds.includes(listing.id);
                  return (
                    <label key={listing.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${checked ? (isLight ? 'border-[#3F5331]' : 'border-[#C8E6A0]/50') : (isLight ? 'border-gray-200' : 'border-white/15')}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleListing(listing.id)} className="w-5 h-5 rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{listing.title}</p>
                        <p className={`text-xs truncate ${isLight ? 'text-gray-500' : 'text-white/50'}`}>{listing.location}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className={`text-xs mt-3 ${isLight ? 'text-gray-500' : 'text-white/45'}`}>{t('businessProfile.steps.step5.hint')}</p>
            </>
          )}

          {step === 'preview' && (
            <>
              <h2 className="text-xl font-bold mb-2">{t('businessProfile.preview.title')}</h2>
              <p className={`text-sm mb-4 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.preview.subtitle')}</p>
              <div className={`rounded-2xl overflow-hidden border ${isLight ? 'border-gray-200' : 'border-white/15'}`}>
                <div className="h-28 bg-[#3F5331]/30 relative">
                  {form.coverPreview && <img src={previewSrc(form.coverPreview)} alt="" className="w-full h-full object-cover" />}
                  <div className="absolute -bottom-8 left-4 w-16 h-16 rounded-xl border-4 border-[#0a0a0a] overflow-hidden bg-[#1C1C1C]">
                    {form.logoPreview && <img src={previewSrc(form.logoPreview)} alt="" className="w-full h-full object-cover" />}
                  </div>
                </div>
                <div className="pt-10 p-4 space-y-2">
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
              <h2 className="text-xl font-bold mb-1">{t('businessProfile.tariff.title')}</h2>
              <p className={`text-sm mb-5 ${isLight ? 'text-gray-600' : 'text-white/60'}`}>{t('businessProfile.tariff.subtitle')}</p>
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
          <div className={`fixed bottom-0 left-0 right-0 p-4 border-t ${headerBorder} ${shell}`}>
            {step === 'tariff' ? (
              <button
                type="button"
                onClick={() => {
                  if (!validateStep('tariff')) return;
                  setStep('payment');
                }}
                className="w-full py-3.5 rounded-2xl font-semibold bg-[#3F5331] text-white"
              >
                {t('businessProfile.continue')}
              </button>
            ) : (
              continueBtn
            )}
          </div>
        )}
      </div>

      <PaymentSummaryModal
        isOpen={step === 'payment'}
        onClose={() => setStep('tariff')}
        onConfirm={handlePayment}
        businessPlan={form.selectedPlan}
        userBalance={userBalance}
        tg={tg}
      />
    </>
  );
}

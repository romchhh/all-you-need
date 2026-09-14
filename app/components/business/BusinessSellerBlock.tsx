'use client';

import { MapPin, Users, Package, Calendar, ChevronRight, BadgeCheck } from 'lucide-react';
import { BusinessSeller } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getAppearanceClasses } from '@/utils/appearanceClasses';
import { getCategories } from '@/constants/categories';
import { getResolvedImageUrl } from '@/utils/imageUtils';
import { useMemo } from 'react';

interface BusinessSellerBlockProps {
  business: BusinessSeller;
  onViewProfile?: () => void;
  tg?: TelegramWebApp | null;
}

export function BusinessSellerBlock({ business, onViewProfile, tg }: BusinessSellerBlockProps) {
  const { t } = useLanguage();
  const { isLight } = useTheme();
  const ac = getAppearanceClasses(isLight);
  const categories = useMemo(() => getCategories(t), [t]);
  const categoryLabel =
    categories.find((c) => c.id === business.category)?.name || business.category;

  const logoUrl = business.logo ? getResolvedImageUrl(business.logo) : null;
  const isPro = business.plan === 'business_pro';

  return (
    <div
      className={`mb-6 rounded-2xl overflow-hidden border ${
        isLight ? 'border-[#3F5331]/20 bg-gradient-to-br from-[#3F5331]/5 to-white' : 'border-[#C8E6A0]/15 bg-[#141414]'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 ${
              isLight ? 'border-white shadow-md' : 'border-[#C8E6A0]/30'
            }`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center text-xl font-bold ${
                  isLight ? 'bg-[#3F5331]/10 text-[#3F5331]' : 'bg-white/10 text-[#C8E6A0]'
                }`}
              >
                {business.businessName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className={`font-bold text-lg truncate ${ac.pageHeading}`}>{business.businessName}</p>
              <BadgeCheck size={18} className="text-emerald-400 shrink-0" />
            </div>
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mb-2 tracking-wide ${
                isLight ? 'bg-[#3F5331] text-white' : 'bg-[#C8E6A0]/15 text-[#C8E6A0] border border-[#C8E6A0]/40'
              }`}
            >
              BUSINESS{isPro ? ' PRO' : ''}
            </span>
            <div className={`flex items-center gap-1 text-sm ${ac.mutedText}`}>
              <MapPin size={14} className="shrink-0" />
              <span>
                {categoryLabel} · {business.city}
              </span>
            </div>
          </div>
        </div>

        <div className={`grid grid-cols-3 gap-2 mb-4 text-center text-xs ${ac.mutedText}`}>
          <div className={`rounded-xl py-2 ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
            <Package size={14} className="mx-auto mb-1 opacity-70" />
            <p className={`font-semibold ${ac.pageHeading}`}>{business.activeListingsCount}</p>
            <p>{t('businessProfile.public.listingsShort')}</p>
          </div>
          <div className={`rounded-xl py-2 ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
            <Users size={14} className="mx-auto mb-1 opacity-70" />
            <p className={`font-semibold ${ac.pageHeading}`}>{business.followersCount}</p>
            <p>{t('businessProfile.public.followersShort')}</p>
          </div>
          <div className={`rounded-xl py-2 ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
            <Calendar size={14} className="mx-auto mb-1 opacity-70" />
            <p className={`font-semibold ${ac.pageHeading}`}>{business.memberSince}</p>
            <p>{t('businessProfile.public.onPlatform')}</p>
          </div>
        </div>

        {onViewProfile && (
          <button
            type="button"
            onClick={() => {
              onViewProfile();
              tg?.HapticFeedback.impactOccurred('light');
            }}
            className={`w-full rounded-xl px-4 py-3 font-semibold transition-colors flex items-center justify-center gap-2 ${
              isLight
                ? 'bg-[#3F5331] text-white hover:bg-[#344728]'
                : 'bg-[#C8E6A0] text-[#0f1408] hover:bg-[#dff5c0]'
            }`}
          >
            {t('businessProfile.public.viewProfile')}
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

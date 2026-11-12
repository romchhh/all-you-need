'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Copy,
  Info,
  Loader2,
  Plus,
  Bookmark,
  ChevronRight,
  ChevronLeft,
  Share2,
} from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { useHideBottomNav } from '@/features/ui/hooks/useHideBottomNav';
import { buildDefaultChatListingText } from '@/lib/share/buildChatListingText';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { getCurrencySymbol } from '@/utils/currency';
import type { ShareChatItem } from '@/lib/share/shareChatQuery';
import { formatCityFilterLabel } from '@/lib/city/cityNormalization';
import { getCategories } from '@/constants/categories';
import {
  canUseShareMessage,
  openShareGroupChat,
} from '@/lib/share/openShareGroup';
import {
  clearDistributeResume,
  consumeDistributeResume,
  saveDistributeResume,
} from '@/lib/share/distributeResume';

function chatRowKey(chat: ShareChatItem): string {
  if (chat.parserKey) return `parser:${chat.parserKey}`;
  if (chat.isCustom) return `custom:${chat.id}`;
  return `catalog:${chat.id}`;
}

interface DistributeListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  telegramId: string;
  tg: TelegramWebApp | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** Відкрити картку оголошення; після повернення модалку можна відновити з sessionStorage. */
  onOpenListing?: () => void;
}

type GroupsTab = 'recommended' | 'mine';

export function DistributeListingModal({
  isOpen,
  onClose,
  listing,
  telegramId,
  tg,
  showToast,
  onOpenListing,
}: DistributeListingModalProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  useBodyScrollLock(isOpen);
  useHideBottomNav(isOpen);

  const lang = language === 'ru' ? 'ru' : 'uk';
  const categories = useMemo(() => getCategories(t), [t]);

  const [step, setStep] = useState<1 | 2>(1);
  const [chatText, setChatText] = useState('');
  const [loadingChats, setLoadingChats] = useState(false);
  const [chats, setChats] = useState<ShareChatItem[]>([]);
  const [groupsTab, setGroupsTab] = useState<GroupsTab>('recommended');
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [sharingNative, setSharingNative] = useState(false);
  const [showAddChat, setShowAddChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [newChatLink, setNewChatLink] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const imageUrl = useMemo(() => resolveListingCardImageUrl(listing), [listing]);
  const shareMessageReady = canUseShareMessage(tg);

  const defaultText = useMemo(
    () =>
      buildDefaultChatListingText(
        {
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          currency: listing.currency,
          isFree: listing.isFree,
          location: listing.location,
          negotiableLabel: t('common.negotiable'),
          freeLabel: t('common.free'),
        },
        lang
      ),
    [listing, lang, t]
  );

  useEffect(() => {
    if (!isOpen) {
      setHydrated(false);
      return;
    }
    const resume = consumeDistributeResume(listing.id);
    if (resume) {
      setStep(resume.step);
      setChatText(resume.chatText || defaultText);
      setGroupsTab(resume.groupsTab || 'recommended');
      setCityFilter(resume.cityFilter || '');
      setCategoryFilter(resume.categoryFilter || 'all');
    } else {
      setStep(1);
      setChatText(defaultText);
      setGroupsTab('recommended');
      setCategoryFilter('all');
      setCityFilter('');
    }
    setShowAddChat(false);
    setHydrated(true);
  }, [isOpen, listing.id, defaultText]);

  const persistResume = useCallback(
    (nextStep: 1 | 2 = step) => {
      saveDistributeResume({
        listingId: listing.id,
        step: nextStep,
        chatText,
        groupsTab,
        cityFilter,
        categoryFilter,
      });
    },
    [listing.id, step, chatText, groupsTab, cityFilter, categoryFilter]
  );

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const params = new URLSearchParams({
        telegramId,
        listingId: String(listing.id),
        category: groupsTab === 'mine' ? 'all' : categoryFilter,
      });
      // «Мої групи» — без фільтра міста, щоб обрані не зникали
      const cityParam =
        groupsTab === 'mine' ? '__all__' : cityFilter || '__all__';
      params.set('city', cityParam);
      const res = await fetch(`/api/share-chats?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setChats(data.chats || []);
      if (
        groupsTab === 'recommended' &&
        (!cityFilter || cityFilter === '') &&
        data.defaults?.city
      ) {
        setCityFilter(data.defaults.city);
      }
    } catch {
      showToast(t('distribute.loadChatsError'), 'error');
    } finally {
      setLoadingChats(false);
    }
  }, [telegramId, listing.id, categoryFilter, cityFilter, groupsTab, showToast, t]);

  useEffect(() => {
    if (isOpen && hydrated && step === 2) {
      void loadChats();
    }
  }, [isOpen, hydrated, step, loadChats]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of chats) {
      if (c.cityKey) set.add(c.cityKey);
    }
    if (cityFilter) set.add(cityFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [chats, cityFilter]);

  const visibleChats = useMemo(() => {
    const list =
      groupsTab === 'mine'
        ? chats.filter((c) => c.isSaved || c.isCustom)
        : chats.filter((c) => !c.isCustom);
    // Збережені — завжди зверху
    return [...list].sort((a, b) => {
      const as = a.isSaved || a.isCustom ? 1 : 0;
      const bs = b.isSaved || b.isCustom ? 1 : 0;
      if (as !== bs) return bs - as;
      return (b.relevance || 0) - (a.relevance || 0);
    });
  }, [chats, groupsTab]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(chatText);
      showToast(t('distribute.copied'), 'success');
      tg?.HapticFeedback?.notificationOccurred('success');
      return true;
    } catch {
      showToast(t('distribute.copyError'), 'error');
      return false;
    }
  };

  const sendToBot = async () => {
    if (!chatText.trim()) {
      showToast(t('distribute.editText'), 'info');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId,
          chatText,
          mode: 'bot',
          catalogChatIds: [],
          customChatIds: [],
          parserGroupKeys: [],
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(t('distribute.sentToBot'), 'success');
      tg?.HapticFeedback?.notificationOccurred('success');
      setStep(2);
    } catch {
      showToast(t('distribute.sendError'), 'error');
    } finally {
      setSending(false);
    }
  };

  const shareViaTelegramNative = async () => {
    if (!shareMessageReady) {
      showToast(t('distribute.shareNativeUnavailable'), 'info');
      return;
    }
    setSharingNative(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/prepare-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, chatText }),
      });
      const data = await res.json();
      if (!res.ok || !data.preparedMessageId) {
        throw new Error(data.error || 'prepare_failed');
      }
      tg?.shareMessage?.(String(data.preparedMessageId), (sent) => {
        if (sent) {
          showToast(t('distribute.shareNativeSent'), 'success');
          tg?.HapticFeedback?.notificationOccurred('success');
        }
      });
    } catch {
      showToast(t('distribute.shareNativeError'), 'error');
    } finally {
      setSharingNative(false);
    }
  };

  const toggleSaved = async (item: ShareChatItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const body: Record<string, unknown> = {
        action: 'toggle_saved',
        telegramId,
      };
      if (item.parserKey || item.isCustom) {
        body.parserKey = item.parserKey || undefined;
        body.inviteLink = item.inviteLink;
        body.title = item.title;
        body.language = lang;
      } else {
        body.catalogChatId = item.id;
      }
      const res = await fetch('/api/share-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      tg?.HapticFeedback?.selectionChanged();
      showToast(
        data.isSaved ? t('distribute.addedToMine') : t('distribute.removedFromMine'),
        'success'
      );
      await loadChats();
    } catch {
      showToast(t('distribute.saveError'), 'error');
    }
  };

  const openGroup = async (item: ShareChatItem) => {
    if (!item.inviteLink) {
      showToast(t('distribute.noInviteLink'), 'error');
      return;
    }
    tg?.HapticFeedback?.impactOccurred('light');
    // Публічний t.me/username → ?text= (як шаблон продавцю).
    // Invite (+/joinchat) параметр text не підтримує → clipboard + відкрити чат.
    // Нативне «Переслати» (shareMessage) — окрема кнопка вище: не прив’язана до конкретної групи.
    const result = openShareGroupChat(item.inviteLink, chatText, tg);
    if (result.mode === 'prefill') {
      showToast(t('distribute.openedWithText'), 'success');
      return;
    }
    await copyText();
    showToast(t('distribute.openedInviteCopied'), 'info');
  };

  const addCustomChat = async () => {
    try {
      const res = await fetch('/api/share-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_custom',
          telegramId,
          title: newChatTitle,
          inviteLink: newChatLink,
          language: lang,
        }),
      });
      if (!res.ok) throw new Error('fail');
      setNewChatTitle('');
      setNewChatLink('');
      setShowAddChat(false);
      setGroupsTab('mine');
      await loadChats();
      showToast(t('distribute.chatAdded'), 'success');
    } catch {
      showToast(t('distribute.addChatError'), 'error');
    }
  };

  const handleOpenListing = () => {
    persistResume(step);
    tg?.HapticFeedback?.impactOccurred('light');
    if (onOpenListing) {
      onOpenListing();
      return;
    }
    // Вже на картці (ListingDetail) — ховаємо модалку; батько відновить через resume
    onClose();
  };

  const handleClose = () => {
    clearDistributeResume();
    onClose();
  };

  if (!isOpen || !mounted) return null;

  const panel = isLight
    ? 'bg-white text-gray-900 w-full sm:max-w-lg h-[min(92vh,720px)] max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-gray-200 flex flex-col shadow-xl overflow-hidden'
    : 'bg-[#0d0d0d] text-white w-full sm:max-w-lg h-[min(92vh,720px)] max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-white/10 flex flex-col shadow-xl overflow-hidden';

  const priceLabel = listing.isFree
    ? t('common.free')
    : `${listing.price}${getCurrencySymbol(listing.currency)}`;

  const muted = isLight ? 'text-gray-600' : 'text-white/65';
  const inputCls = isLight
    ? 'bg-white border-gray-200 text-gray-900'
    : 'bg-black/40 border-white/15 text-white';
  const footerBg = isLight ? 'bg-white border-gray-200' : 'bg-[#0d0d0d] border-white/10';

  const modal = (
    <div
      className="fixed inset-0 z-[99990] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      onClick={handleClose}
    >
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-start gap-3 px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isLight ? 'bg-[#3F5331]/15 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
            }`}
          >
            <Send size={18} />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-base font-bold leading-tight">{t('distribute.title')}</h2>
            <p className={`text-[11px] mt-1 leading-snug line-clamp-2 ${muted}`}>
              {t('distribute.subtitleHero')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-3 top-3 p-2 rounded-full opacity-70 hover:opacity-100"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-3 shrink-0 space-y-2">
          <button
            type="button"
            onClick={handleOpenListing}
            className={`w-full flex gap-3 items-center p-2.5 rounded-2xl text-left transition active:scale-[0.99] ${
              isLight ? 'bg-gray-50 hover:bg-gray-100' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-black/20">
              {imageUrl ? (
                <CachedListingImage src={imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs opacity-50">
                  📦
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{listing.title}</div>
              <div className={`text-xs truncate ${muted}`}>
                {priceLabel} · {listing.location}
              </div>
            </div>
            <ChevronRight size={18} className="opacity-40 shrink-0" />
          </button>

          <div className="flex items-center gap-2">
            <StepDot active={step === 1} done={step > 1} label="1" isLight={isLight} />
            <div className={`flex-1 h-px ${isLight ? 'bg-gray-200' : 'bg-white/15'}`} />
            <StepDot active={step === 2} done={false} label="2" isLight={isLight} />
            <span className={`text-[11px] font-medium ${muted}`}>
              {step === 1 ? t('distribute.step1Short') : t('distribute.step2Short')}
            </span>
          </div>
        </div>

        {step === 1 ? (
          <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 min-h-0">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide opacity-70">
                {t('distribute.editText')}
              </label>
              <p className={`text-[11px] mt-1 ${muted}`}>{t('distribute.editTextHint')}</p>
            </div>
            <textarea
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              rows={8}
              className={`w-full rounded-2xl p-3 text-sm border resize-none min-h-[140px] ${inputCls}`}
            />
            <button
              type="button"
              onClick={() => void copyText()}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm border-2 ${
                isLight ? 'border-[#3F5331] text-[#3F5331]' : 'border-[#C8E6A0] text-[#C8E6A0]'
              }`}
            >
              <Copy size={16} />
              {t('distribute.copy')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 px-4 pt-3 gap-2">
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void copyText()}
                className={`min-w-0 flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-xs leading-none border-2 ${
                  isLight ? 'border-[#3F5331] text-[#3F5331]' : 'border-[#C8E6A0] text-[#C8E6A0]'
                }`}
              >
                <Copy size={16} strokeWidth={2.25} className="shrink-0" aria-hidden />
                <span className="truncate">{t('distribute.copyAgain')}</span>
              </button>
              {shareMessageReady ? (
                <button
                  type="button"
                  disabled={sharingNative}
                  onClick={() => void shareViaTelegramNative()}
                  className="min-w-0 flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-semibold text-xs leading-none bg-[#C8E6A0] text-[#1a1a1a] disabled:opacity-60"
                >
                  {sharingNative ? (
                    <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Share2 size={16} className="shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{t('distribute.shareNative')}</span>
                </button>
              ) : null}
            </div>

            <div
              className={`flex p-1 rounded-xl shrink-0 ${isLight ? 'bg-gray-100' : 'bg-white/10'}`}
            >
              <TabBtn
                active={groupsTab === 'recommended'}
                onClick={() => setGroupsTab('recommended')}
                label={t('distribute.tabRecommended')}
                isLight={isLight}
              />
              <TabBtn
                active={groupsTab === 'mine'}
                onClick={() => setGroupsTab('mine')}
                label={t('distribute.tabMine')}
                isLight={isLight}
              />
            </div>

            <div className="flex items-stretch gap-2 shrink-0 w-full">
              <select
                value={cityFilter || '__all__'}
                onChange={(e) =>
                  setCityFilter(e.target.value === '__all__' ? '__all__' : e.target.value)
                }
                disabled={groupsTab === 'mine'}
                className={`min-w-0 flex-1 h-9 text-xs rounded-xl px-2.5 border appearance-none ${inputCls} disabled:opacity-50`}
              >
                <option value="__all__">{t('distribute.allCities')}</option>
                {cityOptions
                  .filter((c) => c && c !== '__all__')
                  .map((c) => (
                    <option key={`city:${c}`} value={c}>
                      {formatCityFilterLabel(c) || c}
                    </option>
                  ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                disabled={groupsTab === 'mine'}
                className={`min-w-0 flex-1 h-9 text-xs rounded-xl px-2.5 border appearance-none ${inputCls} disabled:opacity-50`}
              >
                <option value="all">{t('distribute.allCategories')}</option>
                {categories.map((cat) => (
                  <option key={`cat:${cat.id}`} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowAddChat((v) => !v)}
              className={`w-full shrink-0 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border border-dashed ${
                isLight ? 'border-gray-300 text-gray-700' : 'border-white/20 text-white/80'
              }`}
            >
              <Plus size={14} />
              {t('distribute.addYourChat')}
            </button>

            {showAddChat ? (
              <div
                className={`shrink-0 space-y-2 p-3 rounded-2xl ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}
              >
                <input
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  placeholder={t('distribute.chatNamePlaceholder')}
                  className={`w-full rounded-xl px-3 py-2 text-sm border ${inputCls}`}
                />
                <input
                  value={newChatLink}
                  onChange={(e) => setNewChatLink(e.target.value)}
                  placeholder={t('distribute.chatLinkPlaceholder')}
                  className={`w-full rounded-xl px-3 py-2 text-sm border ${inputCls}`}
                />
                <button
                  type="button"
                  onClick={() => void addCustomChat()}
                  className="w-full py-2 rounded-xl bg-[#C8E6A0] text-[#1a1a1a] font-semibold text-sm"
                >
                  {t('common.save')}
                </button>
              </div>
            ) : null}

            <div
              className={`flex-1 min-h-0 overflow-y-auto overscroll-contain rounded-2xl border ${
                isLight ? 'border-gray-200 bg-gray-50/50' : 'border-white/10 bg-black/20'
              }`}
            >
              {loadingChats ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin" size={28} />
                </div>
              ) : visibleChats.length === 0 ? (
                <p className={`text-sm text-center py-8 px-4 ${muted}`}>
                  {groupsTab === 'mine'
                    ? t('distribute.noMineChats')
                    : t('distribute.noChatsFound')}
                </p>
              ) : (
                <ul className={`divide-y ${isLight ? 'divide-gray-100' : 'divide-white/5'}`}>
                  {visibleChats.map((chat) => (
                    <li key={chatRowKey(chat)}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => void openGroup(chat)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void openGroup(chat);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 cursor-pointer ${
                          isLight ? 'hover:bg-white' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <ChatRowAvatar title={chat.title} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{chat.title}</div>
                          <div className={`text-xs truncate ${muted}`}>
                            {chat.subtitle ||
                              (chat.memberCount
                                ? t('distribute.members', { count: String(chat.memberCount) })
                                : chat.cityKey || '')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => void toggleSaved(chat, e)}
                          className={`p-2 rounded-full shrink-0 relative z-[1] ${
                            chat.isSaved
                              ? 'bg-[#C8E6A0]/25 text-[#7CB342]'
                              : isLight
                                ? 'text-gray-400 hover:text-gray-600'
                                : 'text-white/35 hover:text-white/60'
                          }`}
                          aria-label={t('distribute.saveChat')}
                        >
                          <Bookmark
                            size={18}
                            className={chat.isSaved ? 'fill-[#7CB342] text-[#7CB342]' : undefined}
                            strokeWidth={chat.isSaved ? 2.25 : 2}
                          />
                        </button>
                        <ChevronRight
                          size={18}
                          className={`shrink-0 ${isLight ? 'text-gray-400' : 'text-white/35'}`}
                          aria-hidden
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className={`flex gap-2 text-[11px] leading-snug shrink-0 pb-1 ${muted}`}>
              <Info size={14} className="shrink-0 mt-0.5" />
              <span className="line-clamp-2">{t('distribute.step2Hint')}</span>
            </p>
          </div>
        )}

        <div
          className={`shrink-0 border-t flex gap-2 px-4 pt-3 relative z-[2] ${footerBg}`}
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className={`flex-1 py-3 rounded-2xl font-semibold border-2 ${
                  isLight ? 'border-gray-300 text-gray-800' : 'border-white/25 text-white'
                }`}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendToBot()}
                className="flex-[1.5] py-3 rounded-2xl font-semibold bg-[#C8E6A0] text-[#1a1a1a] disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {t('distribute.saveInBot')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex-1 py-3 rounded-2xl font-semibold border-2 flex items-center justify-center gap-1 ${
                  isLight ? 'border-gray-300 text-gray-800' : 'border-white/25 text-white'
                }`}
              >
                <ChevronLeft size={18} />
                {t('distribute.backToStep1')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-3 rounded-2xl font-semibold bg-[#C8E6A0] text-[#1a1a1a]"
              >
                {t('distribute.done')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function StepDot({
  active,
  done,
  label,
  isLight,
}: {
  active: boolean;
  done: boolean;
  label: string;
  isLight: boolean;
}) {
  const on = active || done;
  return (
    <span
      className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
        on
          ? 'bg-[#C8E6A0] text-[#1a1a1a]'
          : isLight
            ? 'bg-gray-200 text-gray-500'
            : 'bg-white/10 text-white/50'
      }`}
    >
      {label}
    </span>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  isLight,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  isLight: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
        active
          ? 'bg-[#C8E6A0] text-[#1a1a1a] shadow-sm'
          : isLight
            ? 'text-gray-600'
            : 'text-white/60'
      }`}
    >
      {label}
    </button>
  );
}

function ChatRowAvatar({ title }: { title: string }) {
  const letter = title.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3F5331] to-[#C8E6A0] flex items-center justify-center text-sm font-bold text-white shrink-0">
      {letter}
    </div>
  );
}

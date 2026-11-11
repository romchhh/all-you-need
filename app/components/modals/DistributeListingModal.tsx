'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Send,
  Copy,
  MapPin,
  Info,
  Loader2,
  Plus,
  Star,
} from 'lucide-react';
import { Listing } from '@/types';
import { TelegramWebApp } from '@/types/telegram';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBodyScrollLock } from '@/features/ui/hooks/useBodyScrollLock';
import { buildDefaultChatListingText } from '@/lib/share/buildChatListingText';
import { resolveListingCardImageUrl } from '@/lib/listings/imageUrl';
import { CachedListingImage } from '@/components/listing/CachedListingImage';
import { getCurrencySymbol } from '@/utils/currency';
import type { ShareChatItem } from '@/lib/share/shareChatQuery';
import { formatCityFilterLabel } from '@/lib/city/cityNormalization';

interface DistributeListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
  telegramId: string;
  tg: TelegramWebApp | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function DistributeListingModal({
  isOpen,
  onClose,
  listing,
  telegramId,
  tg,
  showToast,
}: DistributeListingModalProps) {
  const { t, language } = useLanguage();
  const { isLight } = useTheme();
  useBodyScrollLock(isOpen);

  const lang = language === 'ru' ? 'ru' : 'uk';
  const [chatText, setChatText] = useState('');
  const [loadingChats, setLoadingChats] = useState(false);
  const [chats, setChats] = useState<ShareChatItem[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<Set<number>>(new Set());
  const [selectedCustom, setSelectedCustom] = useState<Set<number>>(new Set());
  const [selectedParserKeys, setSelectedParserKeys] = useState<Set<string>>(new Set());
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const autoSelectedChatsRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [showAddChat, setShowAddChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [newChatLink, setNewChatLink] = useState('');

  const imageUrl = useMemo(() => resolveListingCardImageUrl(listing), [listing]);

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
    if (!isOpen) return;
    setChatText(defaultText);
    setSelectedCatalog(new Set());
    setSelectedCustom(new Set());
    setSelectedParserKeys(new Set());
    setCategoryFilter('all');
    setLangFilter('all');
    autoSelectedChatsRef.current = false;
  }, [isOpen, defaultText]);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const params = new URLSearchParams({
        telegramId,
        listingId: String(listing.id),
        category: categoryFilter,
      });
      if (langFilter !== 'all') params.set('lang', langFilter);
      if (cityFilter) params.set('city', cityFilter);
      const res = await fetch(`/api/share-chats?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed');
      setChats(data.chats || []);
      if (!cityFilter && data.defaults?.city) {
        setCityFilter(data.defaults.city);
      }
    } catch {
      showToast(t('distribute.loadChatsError'), 'error');
    } finally {
      setLoadingChats(false);
    }
  }, [telegramId, listing.id, langFilter, categoryFilter, cityFilter, showToast, t]);

  useEffect(() => {
    if (isOpen) {
      void loadChats();
    }
  }, [isOpen, loadChats]);

  useEffect(() => {
    if (!isOpen || loadingChats || chats.length === 0) return;
    if (autoSelectedChatsRef.current) return;
    if (selectedCatalog.size > 0 || selectedCustom.size > 0 || selectedParserKeys.size > 0) return;
    const top = chats.filter((c) => !c.isCustom).slice(0, 3);
    const parserKeys = top.filter((c) => c.parserKey).map((c) => c.parserKey!);
    const catalogIds = top.filter((c) => !c.isCustom && !c.parserKey).map((c) => c.id);
    if (parserKeys.length > 0) setSelectedParserKeys(new Set(parserKeys));
    if (catalogIds.length > 0) setSelectedCatalog(new Set(catalogIds));
    if (top.length > 0) autoSelectedChatsRef.current = true;
  }, [isOpen, chats, loadingChats, selectedCatalog.size, selectedCustom.size, selectedParserKeys.size]);

  const selectedCount = selectedCatalog.size + selectedCustom.size + selectedParserKeys.size;

  const toggleChat = (item: ShareChatItem) => {
    if (item.parserKey) {
      setSelectedParserKeys((prev) => {
        const next = new Set(prev);
        if (next.has(item.parserKey!)) next.delete(item.parserKey!);
        else next.add(item.parserKey!);
        return next;
      });
    } else if (item.isCustom) {
      setSelectedCustom((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      setSelectedCatalog((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    }
    tg?.HapticFeedback?.selectionChanged();
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(chatText);
      showToast(t('distribute.copied'), 'success');
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch {
      showToast(t('distribute.copyError'), 'error');
    }
  };

  const sendToBot = async () => {
    if (selectedCount === 0) {
      showToast(t('distribute.selectChatsHint'), 'info');
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
          catalogChatIds: Array.from(selectedCatalog),
          customChatIds: Array.from(selectedCustom),
          parserGroupKeys: Array.from(selectedParserKeys),
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(t('distribute.sentToBotWithGroups'), 'success');
      tg?.HapticFeedback?.notificationOccurred('success');
      onClose();
    } catch {
      showToast(t('distribute.sendError'), 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleSaved = async (item: ShareChatItem) => {
    if (item.isCustom || item.parserKey) return;
    try {
      const res = await fetch('/api/share-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_saved',
          telegramId,
          catalogChatId: item.id,
        }),
      });
      if (!res.ok) throw new Error('fail');
      await loadChats();
    } catch {
      showToast(t('distribute.saveError'), 'error');
    }
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
          language: langFilter === 'all' ? lang : langFilter,
        }),
      });
      if (!res.ok) throw new Error('fail');
      setNewChatTitle('');
      setNewChatLink('');
      setShowAddChat(false);
      await loadChats();
      showToast(t('distribute.chatAdded'), 'success');
    } catch {
      showToast(t('distribute.addChatError'), 'error');
    }
  };

  if (!isOpen) return null;

  const overlay = 'fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4';
  const panel = isLight
    ? 'bg-white text-gray-900 w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-gray-200 flex flex-col shadow-xl'
    : 'bg-[#0d0d0d] text-white w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl border border-white/10 flex flex-col shadow-xl';

  const priceLabel = listing.isFree
    ? t('common.free')
    : `${listing.price}${getCurrencySymbol(listing.currency)}`;

  return (
    <div className={overlay} onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-start gap-3 p-4 pb-3 border-b border-white/10">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
              isLight ? 'bg-[#3F5331]/15 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
            }`}
          >
            <Send size={20} />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h2 className="text-lg font-bold leading-tight">{t('distribute.title')}</h2>
            <p className={`text-xs mt-1 ${isLight ? 'text-gray-600' : 'text-white/65'}`}>
              {t('distribute.subtitleUnified')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full opacity-70 hover:opacity-100" aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
          <div className={`flex gap-3 items-center p-3 rounded-2xl ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black/20">
              {imageUrl ? (
                <CachedListingImage src={imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs opacity-50">📦</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{listing.title}</div>
              <div className={`text-xs ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                {priceLabel} · {listing.location}
              </div>
            </div>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-wide opacity-70">
            {t('distribute.editText')}
          </label>
          <textarea
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            rows={8}
            className={`w-full rounded-2xl p-3 text-sm border resize-y min-h-[140px] ${
              isLight
                ? 'bg-white border-gray-200 text-gray-900'
                : 'bg-black/40 border-white/15 text-white'
            }`}
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

          <div className="border-t border-white/10 pt-3 space-y-3">
            <h3 className="text-sm font-bold">{t('distribute.step2GroupsTitle')}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip icon={<MapPin size={14} />} label={formatCityFilterLabel(cityFilter) || t('distribute.allCities')} isLight={isLight} />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`text-xs rounded-full px-3 py-1.5 border ${isLight ? 'bg-white border-gray-200' : 'bg-black/40 border-white/15'}`}
              >
                <option value="all">{t('distribute.allCategories')}</option>
                <option value={listing.category}>{listing.category}</option>
              </select>
              <span className={`ml-auto text-xs font-semibold ${isLight ? 'text-[#3F5331]' : 'text-[#C8E6A0]'}`}>
                {t('distribute.selected')}: {selectedCount}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowAddChat((v) => !v)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-dashed ${
                isLight ? 'border-gray-300 text-gray-700' : 'border-white/20 text-white/80'
              }`}
            >
              <Plus size={16} />
              {t('distribute.addYourChat')}
            </button>

            {showAddChat && (
              <div className={`space-y-2 p-3 rounded-2xl ${isLight ? 'bg-gray-50' : 'bg-white/5'}`}>
                <input
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  placeholder={t('distribute.chatNamePlaceholder')}
                  className={`w-full rounded-xl px-3 py-2 text-sm border ${isLight ? 'border-gray-200' : 'border-white/15 bg-black/30'}`}
                />
                <input
                  value={newChatLink}
                  onChange={(e) => setNewChatLink(e.target.value)}
                  placeholder={t('distribute.chatLinkPlaceholder')}
                  className={`w-full rounded-xl px-3 py-2 text-sm border ${isLight ? 'border-gray-200' : 'border-white/15 bg-black/30'}`}
                />
                <button type="button" onClick={() => void addCustomChat()} className="w-full py-2 rounded-xl bg-[#C8E6A0] text-[#1a1a1a] font-semibold text-sm">
                  {t('common.save')}
                </button>
              </div>
            )}

            {loadingChats ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin" size={28} />
              </div>
            ) : chats.length === 0 ? (
              <p className={`text-sm text-center py-6 ${isLight ? 'text-gray-500' : 'text-white/55'}`}>
                {t('distribute.noChatsFound')}
              </p>
            ) : (
              <ul className="space-y-2">
                {chats.map((chat) => {
                    const checked = chat.parserKey
                      ? selectedParserKeys.has(chat.parserKey)
                      : chat.isCustom
                        ? selectedCustom.has(chat.id)
                        : selectedCatalog.has(chat.id);
                  return (
                    <li
                      key={`${chat.isCustom ? 'c' : 'g'}-${chat.id}`}
                      className={`flex items-center gap-3 p-3 rounded-2xl border ${isLight ? 'border-gray-100 bg-white' : 'border-white/10 bg-white/[0.03]'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChat(chat)}
                        className="w-5 h-5 accent-[#C8E6A0]"
                      />
                      <ChatRowAvatar title={chat.title} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{chat.title}</div>
                        <div className={`text-xs truncate ${isLight ? 'text-gray-500' : 'text-white/55'}`}>
                          {chat.subtitle ||
                            t('distribute.members', { count: String(chat.memberCount) })}
                        </div>
                      </div>
                      {chat.postingAllowed && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C8E6A0]/20 text-[#C8E6A0]">
                          {t('distribute.allowed')}
                        </span>
                      )}
                        {!chat.isCustom && !chat.parserKey && (
                        <button
                          type="button"
                          onClick={() => void toggleSaved(chat)}
                          className="p-1.5"
                          aria-label={t('distribute.saveChat')}
                        >
                          <Star
                            size={16}
                            className={chat.isSaved ? 'fill-[#C8E6A0] text-[#C8E6A0]' : 'text-white/40'}
                          />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <p className={`flex gap-2 text-xs leading-relaxed ${isLight ? 'text-gray-600' : 'text-white/55'}`}>
              <Info size={16} className="shrink-0 mt-0.5" />
              {t('distribute.footerHint')}
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-3 rounded-2xl font-semibold border-2 ${isLight ? 'border-gray-300 text-gray-800' : 'border-white/25 text-white'}`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendToBot()}
            className="flex-[1.4] py-3 rounded-2xl font-semibold bg-[#C8E6A0] text-[#1a1a1a] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {t('distribute.sendToBotWithCount', { count: String(selectedCount) })}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  icon,
  label,
  isLight,
}: {
  icon: React.ReactNode;
  label: string;
  isLight: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
        isLight ? 'bg-[#C8E6A0]/30 text-[#3F5331]' : 'bg-[#C8E6A0]/15 text-[#C8E6A0]'
      }`}
    >
      {icon}
      {label}
    </span>
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

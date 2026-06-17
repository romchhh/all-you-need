'use client';

import { usePathname } from 'next/navigation';
import { ListingDetail } from '@/components/listing/ListingDetail';
import { UserProfilePage } from '@/components/profile/UserProfilePage';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { BazaarTab } from '@/components/tabs/BazaarTab';
import { Toast } from '@/components/ui/Toast';
import CreateListingFlow from '@/components/listing/CreateListingFlow';
import { CategoriesModal } from '@/components/modals/CategoriesModal';
import { useAutoPrefetch } from '@/features/bazaar/hooks/usePrefetch';
import { AppHeader } from '@/components/layout/AppHeader';
import { useBazaarPage } from '@/features/bazaar/hooks/useBazaarPage';
import { BazaarPullToRefreshIndicator } from '@/features/bazaar/components/BazaarPullToRefreshIndicator';
import { invalidateCache } from '@/utils/cache';

const BazaarPage = () => {
  const pathname = usePathname();
  useAutoPrefetch(pathname);

  const {
    showBlockedScreen,
    lang,
    t,
    profile,
    categories,
    tg,
    toast,
    showToast,
    hideToast,
    searchQuery,
    handleSearchChange,
    listings,
    initialLoading,
    isListingsRefreshing,
    listingsLoadError,
    hasMore,
    loadMoreListings,
    loadingMore,
    handleRetryLoad,
    favorites,
    toggleFavorite,
    selectedListing,
    selectedSeller,
    overlayOpen,
    handleSelectListingFromCatalog,
    handleCloseListing,
    handleListingBack,
    handleSelectRelatedListing,
    openListingCategoryFromProduct,
    handleViewSellerProfile,
    handleCloseSeller,
    handleBackToPreviousListing,
    handleSelectListingFromSeller,
    handleAutoRenewPersist,
    previousListingRef,
    isCreateListingModalOpen,
    setIsCreateListingModalOpen,
    handleCreateListing,
    isCategoriesModalOpen,
    setIsCategoriesModalOpen,
    handleOpenCategoriesModal,
    selectedCategoryFromModal,
    setSelectedCategoryFromModal,
    fetchListings,
    handleToast,
    handleNavigateToCategories,
    handleBazaarStateChange,
    bazaarTabState,
    isPulling,
    pullDistance,
    pullProgress,
    isRefreshing,
    router,
    setSelectedListing,
    setSelectedSeller,
  } = useBazaarPage();

  if (showBlockedScreen) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-white text-lg font-medium mb-2">⛔ {t('common.blocked')}</p>
        <p className="text-white/70 text-sm">{t('menu.support') || 'Підтримка'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden max-w-full pb-20 animate-content-crossfade">
      {!selectedListing && <AppHeader />}
      <BazaarPullToRefreshIndicator
        isPulling={isPulling}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
        isRefreshing={isRefreshing}
        t={t}
      />
      <div className="mx-auto w-full max-w-2xl overflow-x-hidden lg:max-w-5xl xl:max-w-6xl">
        <div className={overlayOpen ? 'hidden' : undefined} aria-hidden={overlayOpen}>
          <BazaarTab
            categories={categories}
            listings={listings}
            initialLoading={initialLoading}
            isRefreshing={isListingsRefreshing}
            loadError={listingsLoadError}
            onRetryLoad={handleRetryLoad}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            favorites={favorites}
            onSelectListing={handleSelectListingFromCatalog}
            onToggleFavorite={toggleFavorite}
            onCreateListing={handleCreateListing}
            hasMore={hasMore}
            onLoadMore={loadMoreListings}
            loadingMore={loadingMore}
            onNavigateToCategories={handleNavigateToCategories}
            onOpenCategoriesModal={handleOpenCategoriesModal}
            initialSelectedCategory={selectedCategoryFromModal}
            savedState={bazaarTabState}
            onStateChange={handleBazaarStateChange}
            tg={tg}
            profileTelegramId={profile?.telegramId != null ? String(profile.telegramId) : null}
            onToast={handleToast}
          />
        </div>

        {selectedListing && (
          <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-[var(--tg-theme-bg-color,#fff)]">
            <ListingDetail
              key={selectedListing.id}
              listing={selectedListing}
              isFavorite={favorites.has(selectedListing.id)}
              onClose={handleCloseListing}
              onBack={handleListingBack}
              onNavigateToCategory={openListingCategoryFromProduct}
              onToggleFavorite={toggleFavorite}
              onSelectListing={handleSelectRelatedListing}
              onViewSellerProfile={handleViewSellerProfile}
              favorites={favorites}
              tg={tg}
              onAutoRenewPersist={handleAutoRenewPersist}
            />
          </div>
        )}

        {selectedSeller && (
          <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-[var(--tg-theme-bg-color,#fff)]">
            <UserProfilePage
              sellerTelegramId={selectedSeller.telegramId}
              sellerName={selectedSeller.name}
              sellerAvatar={selectedSeller.avatar}
              sellerUsername={selectedSeller.username}
              sellerPhone={selectedSeller.phone}
              onClose={handleCloseSeller}
              onBackToPreviousListing={
                previousListingRef.current ? handleBackToPreviousListing : null
              }
              onSelectListing={handleSelectListingFromSeller}
              onToggleFavorite={toggleFavorite}
              favorites={favorites}
              tg={tg}
            />
          </div>
        )}
      </div>

      <BottomNavigation
        activeTab="bazaar"
        onTabChange={(tab) => {
          const hasOpenDetails = selectedListing || selectedSeller;
          if (hasOpenDetails) {
            setSelectedListing(null);
            setSelectedSeller(null);
          }

          let telegramId = new URLSearchParams(window.location.search).get('telegramId');
          if (!telegramId) {
            telegramId = sessionStorage.getItem('telegramId');
          }

          const queryString = telegramId ? `?telegramId=${telegramId}` : '';
          const targetPath =
            tab === 'bazaar'
              ? 'bazaar'
              : tab === 'favorites'
                ? 'favorites'
                : tab === 'profile'
                  ? 'profile'
                  : 'categories';

          if (hasOpenDetails) {
            setTimeout(() => {
              router.push(`/${lang}/${targetPath}${queryString}`);
            }, 100);
          } else {
            router.push(`/${lang}/${targetPath}${queryString}`);
          }
        }}
        onCloseDetail={() => {
          setSelectedListing(null);
          setSelectedSeller(null);
        }}
        onCreateListing={() => setIsCreateListingModalOpen(true)}
        favoritesCount={favorites.size}
        tg={tg}
      />

      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        onSelectCategory={(categoryId) => {
          setSelectedCategoryFromModal(categoryId);
        }}
        tg={tg}
      />

      {profile && (
        <CreateListingFlow
          isOpen={isCreateListingModalOpen}
          onClose={() => setIsCreateListingModalOpen(false)}
          onSuccess={async () => {
            if (typeof window !== 'undefined') {
              invalidateCache('bazaarListingsState');
            }
            await fetchListings(true);
            setIsCreateListingModalOpen(false);
            showToast(t('createListing.listingCreated'), 'success');
          }}
          tg={tg}
        />
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default BazaarPage;

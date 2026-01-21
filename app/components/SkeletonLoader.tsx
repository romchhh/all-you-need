export const ListingCardSkeleton = () => {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
      <div className="aspect-square bg-gray-200"></div>
      <div className="p-3">
        <div className="h-6 bg-gray-200 rounded mb-2 w-24"></div>
        <div className="h-4 bg-gray-200 rounded mb-1 w-full"></div>
        <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
          <div className="h-3 bg-gray-200 rounded w-20"></div>
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 bg-gray-200 rounded w-16"></div>
          <div className="h-3 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    </div>
  );
};

export const ListingGridSkeleton = ({ count = 6, showLoadingText = false, loadingText }: { count?: number; showLoadingText?: boolean; loadingText?: string }) => {
  return (
    <div className="px-4">
      {showLoadingText && loadingText && (
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#D3F1A7] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white/70 text-sm">{loadingText}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
};


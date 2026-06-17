'use client';

type BazaarPullToRefreshIndicatorProps = {
  isPulling: boolean;
  pullDistance: number;
  pullProgress: number;
  isRefreshing: boolean;
  t: (key: string) => string;
};

export function BazaarPullToRefreshIndicator({
  isPulling,
  pullDistance,
  pullProgress,
  isRefreshing,
  t,
}: BazaarPullToRefreshIndicatorProps) {
  if (!isPulling) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-center z-50 pointer-events-none"
      style={{
        height: `${Math.min(pullDistance * 0.8, 100)}px`,
        opacity: Math.min(pullProgress * 1.2, 1),
        transform: `translateY(${Math.min(pullDistance * 0.4 - 50, 0)}px)`,
        transition: isRefreshing ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
    >
      <div
        className="flex flex-col items-center gap-2 px-5 py-3 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100"
        style={{
          transform: `scale(${Math.min(0.85 + pullProgress * 0.15, 1)}) translateY(${isRefreshing ? '0' : `${-pullDistance * 0.1}px`})`,
          transition: isRefreshing ? 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'transform 0.2s ease-out',
          boxShadow: `0 ${10 + pullProgress * 10}px ${20 + pullProgress * 10}px rgba(0, 0, 0, ${0.1 + pullProgress * 0.05})`,
        }}
      >
        {isRefreshing ? (
          <>
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 border-3 border-blue-200 rounded-full" />
              <div className="absolute inset-0 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="text-sm font-semibold text-blue-600">{t('common.loading')}</span>
          </>
        ) : pullProgress >= 1 ? (
          <>
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <span className="text-sm font-semibold text-blue-600">Відпустіть для оновлення</span>
          </>
        ) : (
          <>
            <div
              className="relative w-8 h-8"
              style={{
                transform: `rotate(${pullProgress * 360}deg)`,
                transition: 'transform 0.1s ease-out',
              }}
            >
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="text-gray-200" />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="url(#bazaar-ptr-gradient)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${56.5 * pullProgress} ${56.5 * (1 - pullProgress)}`}
                  className="transition-all duration-200"
                  style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                />
                <defs>
                  <linearGradient id="bazaar-ptr-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#60A5FA" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span
              className="text-xs font-medium text-gray-500"
              style={{ opacity: 0.6 + pullProgress * 0.4 }}
            >
              {pullProgress > 0.7 ? 'Майже...' : t('common.pullToRefresh')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

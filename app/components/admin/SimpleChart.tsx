'use client';

interface ChartDataPoint {
  date: string;
  count: number;
}

interface SimpleChartProps {
  data: ChartDataPoint[];
  title: string;
  color?: string;
  height?: number;
}

export default function SimpleChart({ data, title, color = '#4F46E5', height = 200 }: SimpleChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">{title}</h3>
        <div className="flex items-center justify-center h-32 sm:h-48 text-gray-900 text-sm">
          Немає даних
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = height - 60;
  const barWidth = Math.max(4, (100 / data.length) * 0.9);

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 w-full max-w-full">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">{title}</h3>
      <div className="relative w-full max-w-full" style={{ height: `${height}px` }}>
        <svg 
          width="100%" 
          height={height} 
          className="overflow-visible w-full" 
          viewBox={`0 0 100 ${height}`} 
          preserveAspectRatio="xMidYMid meet"
        >
          {data.map((point, index) => {
            const barHeight = maxCount > 0 ? (point.count / maxCount) * chartHeight : 0;
            const x = (index / data.length) * 100;
            return (
              <g key={index}>
                <rect
                  x={`${x}%`}
                  y={height - 40 - barHeight}
                  width={`${barWidth}%`}
                  height={barHeight}
                  fill={color}
                  opacity={0.7}
                  className="hover:opacity-100 transition-opacity"
                />
                {point.count > 0 && barHeight > 15 && (
                  <text
                    x={`${x + barWidth / 2}%`}
                    y={height - 45 - barHeight}
                    textAnchor="middle"
                    className="text-xs fill-gray-900"
                    fontSize="10"
                  >
                    {point.count}
                  </text>
                )}
              </g>
            );
          })}
          {/* X-axis */}
          <line
            x1="5%"
            y1={height - 40}
            x2="95%"
            y2={height - 40}
            stroke="currentColor"
            strokeWidth="1"
            className="text-gray-400"
          />
          {/* Y-axis labels */}
          {[0, maxCount / 2, maxCount].map((value, idx) => {
            const y = height - 40 - (value / maxCount) * chartHeight;
            return (
              <g key={idx}>
                <line
                  x1="5%"
                  y1={y}
                  x2="95%"
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeDasharray="2,2"
                  className="text-gray-300"
                />
                <text
                  x="3%"
                  y={y + 4}
                  textAnchor="end"
                  className="text-xs fill-gray-900"
                  fontSize="10"
                >
                  {Math.round(value)}
                </text>
              </g>
            );
          })}
        </svg>
        {/* X-axis date labels (show only every 5th day) */}
        <div className="flex justify-between text-xs text-gray-900 mt-2 px-2 w-full overflow-x-hidden">
          {data.map((point, index) => {
            if (index % 5 === 0 || index === data.length - 1) {
              const date = new Date(point.date);
              return (
                <span key={index} className="whitespace-nowrap flex-shrink-0">
                  {date.getDate()}/{date.getMonth() + 1}
                </span>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

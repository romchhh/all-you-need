'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { TrendingUp, Package, Megaphone, Wallet, Calendar, ArrowUp, ArrowDown } from 'lucide-react';

interface FinanceStats {
  period: string;
  packages: {
    totalPurchases: number;
    balanceRevenue: number;
    directRevenue: number;
    totalRevenue: number;
  };
  promotions: {
    totalPurchases: number;
    balanceRevenue: number;
    directRevenue: number;
    totalRevenue: number;
    byType: Array<{
      type: string;
      count: number;
      revenue: number;
    }>;
  };
  balanceTopUps: {
    totalTopUps: number;
    totalAmount: number;
  };
  totalRevenue: number;
  dailyStats: Array<{
    date: string;
    amount: number;
    type: string;
  }>;
}

export default function FinancesPage() {
  const router = useRouter();
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week');

  useEffect(() => {
    fetchStats();
  }, [period]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/finances?period=${period}`);
      
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching finance stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getPromotionName = (type: string) => {
    const names: Record<string, string> = {
      highlighted: 'Виділення',
      top_category: 'ТОП категорії',
      vip: 'VIP',
    };
    return names[type] || type;
  };

  const getPeriodName = (p: string) => {
    const names: Record<string, string> = {
      day: 'День',
      week: 'Тиждень',
      month: 'Місяць',
      year: 'Рік',
      all: 'Весь час',
    };
    return names[p] || p;
  };

  if (loading) {
    return (
      <>
        <AdminSidebar />
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <AdminSidebar />
        <div className="p-6">
          <p className="text-red-500">Помилка завантаження статистики</p>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminSidebar />
      <div className="p-6 space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Фінанси</h1>
            <p className="text-gray-600 mt-1">Статистика доходів та платежів</p>
          </div>
          
          {/* Вибір періоду */}
          <div className="flex gap-2">
            {(['day', 'week', 'month', 'year', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  period === p
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {getPeriodName(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Загальний дохід */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp size={32} />
            <h2 className="text-2xl font-bold">Загальний дохід</h2>
          </div>
          <div className="text-5xl font-bold mb-2">{formatCurrency(stats.totalRevenue)}</div>
          <p className="text-blue-100">За період: {getPeriodName(period)}</p>
        </div>

        {/* Картки статистики */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Пакети оголошень */}
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Package size={24} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Пакети оголошень</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Продано</p>
                <p className="text-2xl font-bold text-gray-900">{stats.packages.totalPurchases}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Дохід (пряма оплата)</p>
                <p className="text-xl font-bold text-green-600">
                  {formatCurrency(stats.packages.directRevenue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">З балансу</p>
                <p className="text-lg text-gray-700">
                  {formatCurrency(stats.packages.balanceRevenue)}
                </p>
              </div>
            </div>
          </div>

          {/* Реклама */}
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Megaphone size={24} className="text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Реклама</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Куплено</p>
                <p className="text-2xl font-bold text-gray-900">{stats.promotions.totalPurchases}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Дохід (пряма оплата)</p>
                <p className="text-xl font-bold text-purple-600">
                  {formatCurrency(stats.promotions.directRevenue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">З балансу</p>
                <p className="text-lg text-gray-700">
                  {formatCurrency(stats.promotions.balanceRevenue)}
                </p>
              </div>
            </div>
          </div>

          {/* Поповнення балансу */}
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Wallet size={24} className="text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Поповнення</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Транзакцій</p>
                <p className="text-2xl font-bold text-gray-900">{stats.balanceTopUps.totalTopUps}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Сума</p>
                <p className="text-xl font-bold text-blue-600">
                  {formatCurrency(stats.balanceTopUps.totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Статистика по типам реклами */}
        {stats.promotions.byType.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Статистика по типам реклами</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.promotions.byType.map((promo) => (
                <div key={promo.type} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{getPromotionName(promo.type)}</h4>
                    <span className="text-sm text-gray-600">{promo.count} шт</span>
                  </div>
                  <p className="text-xl font-bold text-purple-600">
                    {formatCurrency(promo.revenue)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Детальна статистика */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Структура доходу</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Package size={20} className="text-green-600" />
                <span className="font-medium text-gray-900">Пакети оголошень (пряма оплата)</span>
              </div>
              <div className="text-right">
                <p className="font-bold text-green-600">{formatCurrency(stats.packages.directRevenue)}</p>
                <p className="text-sm text-gray-600">
                  {stats.totalRevenue > 0 
                    ? `${((stats.packages.directRevenue / stats.totalRevenue) * 100).toFixed(1)}%` 
                    : '0%'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Megaphone size={20} className="text-purple-600" />
                <span className="font-medium text-gray-900">Реклама (пряма оплата)</span>
              </div>
              <div className="text-right">
                <p className="font-bold text-purple-600">{formatCurrency(stats.promotions.directRevenue)}</p>
                <p className="text-sm text-gray-600">
                  {stats.totalRevenue > 0 
                    ? `${((stats.promotions.directRevenue / stats.totalRevenue) * 100).toFixed(1)}%` 
                    : '0%'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Wallet size={20} className="text-blue-600" />
                <span className="font-medium text-gray-900">Поповнення балансу</span>
              </div>
              <div className="text-right">
                <p className="font-bold text-blue-600">{formatCurrency(stats.balanceTopUps.totalAmount)}</p>
                <p className="text-sm text-gray-600">
                  {stats.totalRevenue > 0 
                    ? `${((stats.balanceTopUps.totalAmount / stats.totalRevenue) * 100).toFixed(1)}%` 
                    : '0%'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

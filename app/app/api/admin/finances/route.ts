import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAdminAuthenticated } from '@/utils/adminAuth';

export async function GET(request: NextRequest) {
  try {
    // Перевірка авторизації адміністратора
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'week'; // day, week, month, all

    // Визначаємо дату початку періоду
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        startDate = new Date(0); // Від початку часів
        break;
    }

    const startDateStr = startDate.toISOString().replace('T', ' ').substring(0, 19);

    // Статистика по пакетам оголошень
    const packagesStats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as totalPurchases,
        SUM(CASE WHEN paymentMethod = 'balance' THEN price ELSE 0 END) as balanceRevenue,
        SUM(CASE WHEN paymentMethod = 'direct' AND status = 'completed' THEN price ELSE 0 END) as directRevenue,
        SUM(price) as totalRevenue
      FROM PackagePurchase
      WHERE createdAt >= ?
    `, startDateStr) as Array<{
      totalPurchases: number;
      balanceRevenue: number;
      directRevenue: number;
      totalRevenue: number;
    }>;

    // Статистика по промо
    const promotionsStats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as totalPurchases,
        SUM(CASE WHEN paymentMethod = 'balance' THEN price ELSE 0 END) as balanceRevenue,
        SUM(CASE WHEN paymentMethod = 'direct' AND status = 'active' THEN price ELSE 0 END) as directRevenue,
        SUM(price) as totalRevenue,
        promotionType,
        COUNT(*) as count
      FROM PromotionPurchase
      WHERE createdAt >= ?
      GROUP BY promotionType
    `, startDateStr) as Array<{
      totalPurchases: number;
      balanceRevenue: number;
      directRevenue: number;
      totalRevenue: number;
      promotionType: string;
      count: number;
    }>;

    // Загальна статистика по промо
    const totalPromotionsStats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as totalPurchases,
        SUM(CASE WHEN paymentMethod = 'balance' THEN price ELSE 0 END) as balanceRevenue,
        SUM(CASE WHEN paymentMethod = 'direct' AND status = 'active' THEN price ELSE 0 END) as directRevenue,
        SUM(price) as totalRevenue
      FROM PromotionPurchase
      WHERE createdAt >= ?
    `, startDateStr) as Array<{
      totalPurchases: number;
      balanceRevenue: number;
      directRevenue: number;
      totalRevenue: number;
    }>;

    // Статистика по поповненням балансу
    const balanceTopUpsStats = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*) as totalTopUps,
        SUM(amountEur) as totalAmount
      FROM Payment
      WHERE status = 'success' AND createdAt >= ?
    `, startDateStr) as Array<{
      totalTopUps: number;
      totalAmount: number;
    }>;

    // Статистика по днях (для графіка)
    const dailyStats = await prisma.$queryRawUnsafe(`
      SELECT 
        DATE(createdAt) as date,
        SUM(amountEur) as amount,
        'topup' as type
      FROM Payment
      WHERE status = 'success' AND createdAt >= ?
      GROUP BY DATE(createdAt)
      
      UNION ALL
      
      SELECT 
        DATE(createdAt) as date,
        SUM(price) as amount,
        'package' as type
      FROM PackagePurchase
      WHERE createdAt >= ?
      GROUP BY DATE(createdAt)
      
      UNION ALL
      
      SELECT 
        DATE(createdAt) as date,
        SUM(price) as amount,
        'promotion' as type
      FROM PromotionPurchase
      WHERE createdAt >= ?
      GROUP BY DATE(createdAt)
      
      ORDER BY date DESC
      LIMIT 30
    `, startDateStr, startDateStr, startDateStr) as Array<{
      date: string;
      amount: number;
      type: string;
    }>;

    const packagesData = packagesStats[0] || {
      totalPurchases: 0,
      balanceRevenue: 0,
      directRevenue: 0,
      totalRevenue: 0,
    };

    const totalPromotionsData = totalPromotionsStats[0] || {
      totalPurchases: 0,
      balanceRevenue: 0,
      directRevenue: 0,
      totalRevenue: 0,
    };

    const balanceTopUpsData = balanceTopUpsStats[0] || {
      totalTopUps: 0,
      totalAmount: 0,
    };

    // Підраховуємо загальний дохід
    const totalRevenue = 
      Number(packagesData.directRevenue || 0) +
      Number(totalPromotionsData.directRevenue || 0) +
      Number(balanceTopUpsData.totalAmount || 0);

    return NextResponse.json({
      period,
      packages: {
        totalPurchases: Number(packagesData.totalPurchases || 0),
        balanceRevenue: Number(packagesData.balanceRevenue || 0),
        directRevenue: Number(packagesData.directRevenue || 0),
        totalRevenue: Number(packagesData.totalRevenue || 0),
      },
      promotions: {
        totalPurchases: Number(totalPromotionsData.totalPurchases || 0),
        balanceRevenue: Number(totalPromotionsData.balanceRevenue || 0),
        directRevenue: Number(totalPromotionsData.directRevenue || 0),
        totalRevenue: Number(totalPromotionsData.totalRevenue || 0),
        byType: promotionsStats.map(stat => ({
          type: stat.promotionType,
          count: Number(stat.count || 0),
          revenue: Number(stat.totalRevenue || 0),
        })),
      },
      balanceTopUps: {
        totalTopUps: Number(balanceTopUpsData.totalTopUps || 0),
        totalAmount: Number(balanceTopUpsData.totalAmount || 0),
      },
      totalRevenue,
      dailyStats: dailyStats.map(stat => ({
        date: stat.date,
        amount: Number(stat.amount || 0),
        type: stat.type,
      })),
    });
  } catch (error) {
    console.error('Error fetching finance stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch finance statistics' },
      { status: 500 }
    );
  }
}

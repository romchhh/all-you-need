import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { telegramId } = body;

    if (!telegramId) {
      return NextResponse.json(
        { error: 'Missing telegramId' },
        { status: 400 }
      );
    }

    const telegramIdNum = BigInt(telegramId);

    // Перевіряємо чи це перше одобрене оголошення користувача
    // Перевіряємо обидва типи оголошень: Listing (маркетплейс) та TelegramListing (бот)
    const user = await prisma.$queryRawUnsafe(
      `SELECT id FROM User WHERE telegramId = ?`,
      telegramIdNum
    ) as Array<{ id: number }>;

    if (user.length === 0) {
      return NextResponse.json({
        success: true,
        rewardPaid: false,
      });
    }

    const userId = user[0].id;

    // Перевіряємо кількість одобрених оголошень в маркетплейсі
    const approvedMarketplaceCount = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM Listing 
       WHERE userId = ? AND (status = 'active' OR moderationStatus = 'approved')`,
      userId
    ) as Array<{ count: bigint | number }>;

    // Перевіряємо кількість одобрених оголошень в боті
    const approvedTelegramCount = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM TelegramListing 
       WHERE userId = ? AND (status = 'approved' OR moderationStatus = 'approved')`,
      userId
    ) as Array<{ count: bigint | number }>;

    // Конвертуємо BigInt в number перед додаванням
    const marketplaceCount = Number(approvedMarketplaceCount[0]?.count || 0);
    const telegramCount = Number(approvedTelegramCount[0]?.count || 0);
    const totalApproved = marketplaceCount + telegramCount;

    // Якщо це перше одобрене оголошення (totalApproved === 1), перевіряємо реферальний зв'язок
    if (totalApproved === 1) {
      // Отримуємо referrer_telegram_id з таблиці Referral
      // Спочатку перевіряємо чи таблиця існує, якщо ні - створюємо
      try {
        // Перевіряємо чи таблиця існує
        const tableExists = await prisma.$queryRawUnsafe(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='Referral'
        `) as Array<{ name: string }>;
        
        if (tableExists.length === 0) {
          // Створюємо таблицю з TEXT для Telegram ID (щоб підтримувати великі числа)
          await prisma.$executeRawUnsafe(`
            CREATE TABLE Referral (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              referrer_telegram_id TEXT NOT NULL,
              referred_telegram_id TEXT NOT NULL UNIQUE,
              reward_paid INTEGER DEFAULT 0,
              created_at TEXT NOT NULL,
              reward_paid_at TEXT
            )
          `);
          
          // Створюємо індекси
          await prisma.$executeRawUnsafe(`
            CREATE INDEX idx_referral_referrer_telegram_id ON Referral(referrer_telegram_id)
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX idx_referral_referred_telegram_id ON Referral(referred_telegram_id)
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX idx_referral_reward_paid ON Referral(reward_paid)
          `);
        } else {
          // Міграція: перевіряємо чи потрібна міграція
          const tableInfo = await prisma.$queryRawUnsafe(`
            PRAGMA table_info(Referral)
          `) as Array<{ name: string; type: string }>;
          
          const needsMigration = tableInfo.some(
            col => (col.name === 'referrer_telegram_id' || col.name === 'referred_telegram_id') 
                   && col.type.toUpperCase().includes('INTEGER')
          );
          
          if (needsMigration) {
            try {
              // Створюємо нову таблицю з правильними типами
              await prisma.$executeRawUnsafe(`
                CREATE TABLE Referral_new (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  referrer_telegram_id TEXT NOT NULL,
                  referred_telegram_id TEXT NOT NULL UNIQUE,
                  reward_paid INTEGER DEFAULT 0,
                  created_at TEXT NOT NULL,
                  reward_paid_at TEXT
                )
              `);
              
              // Копіюємо дані з конвертацією
              await prisma.$executeRawUnsafe(`
                INSERT INTO Referral_new (id, referrer_telegram_id, referred_telegram_id, reward_paid, created_at, reward_paid_at)
                SELECT id, CAST(referrer_telegram_id AS TEXT), CAST(referred_telegram_id AS TEXT), reward_paid, created_at, reward_paid_at
                FROM Referral
              `);
              
              // Видаляємо стару таблицю і перейменовуємо нову
              await prisma.$executeRawUnsafe(`DROP TABLE Referral`);
              await prisma.$executeRawUnsafe(`ALTER TABLE Referral_new RENAME TO Referral`);
              
              console.log('[Referral Check] Table migrated successfully');
            } catch (migrateError) {
              console.log('[Referral Check] Migration error:', migrateError);
            }
          }
        }
      } catch (error) {
        // Таблиця вже існує або помилка створення - продовжуємо
        console.log('[Referral Check] Table creation check:', error);
      }
      
      // Переконуємося що індекси існують
      try {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS idx_referral_referrer_telegram_id ON Referral(referrer_telegram_id)
        `);
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS idx_referral_referred_telegram_id ON Referral(referred_telegram_id)
        `);
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS idx_referral_reward_paid ON Referral(reward_paid)
        `);
      } catch (indexError) {
        console.log('[Referral Check] Index creation check:', indexError);
      }
      
      const referral = await prisma.$queryRawUnsafe(
        `SELECT referrer_telegram_id, reward_paid FROM Referral WHERE referred_telegram_id = ? AND reward_paid = 0`,
        telegramId.toString()
      ) as Array<{ referrer_telegram_id: string; reward_paid: number }>;

      if (referral.length > 0 && referral[0].reward_paid === 0) {
        const referrerTelegramId = BigInt(referral[0].referrer_telegram_id);

        // Нараховуємо 1€ на баланс запрошувача
        await prisma.$executeRawUnsafe(
          `UPDATE User SET balance = balance + 1.0, updatedAt = CURRENT_TIMESTAMP WHERE telegramId = ?`,
          referrerTelegramId
        );

        // Позначаємо що винагорода виплачена
        await prisma.$executeRawUnsafe(
          `UPDATE Referral SET reward_paid = 1, reward_paid_at = CURRENT_TIMESTAMP WHERE referred_telegram_id = ?`,
          telegramId.toString()
        );

        // Відправляємо повідомлення запрошувачу через Telegram Bot API
        try {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            // Отримуємо мову запрошувача
            const referrerUser = await prisma.$queryRawUnsafe(
              `SELECT language FROM User WHERE telegramId = ?`,
              referrerTelegramId
            ) as Array<{ language: string | null }>;
            
            const lang = referrerUser[0]?.language || 'uk';
            const rewardText = lang === 'ru' 
              ? '💰 <b>Награда получена!</b>\n\nПо вашей ссылке приглашённый пользователь подал своё первое объявление.\n\nВам начислено <b>1€</b> на баланс!'
              : '💰 <b>Винагорода отримана!</b>\n\nЗа вашим посиланням запрошений користувач подав своє перше оголошення.\n\nВам нараховано <b>1€</b> на баланс!';
            
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: referrerTelegramId.toString(),
                text: rewardText,
                parse_mode: 'HTML',
              }),
            });
          }
        } catch (error) {
          console.error('[Referral] Error sending notification:', error);
          // Продовжуємо навіть якщо повідомлення не відправлено
        }

        return NextResponse.json({
          success: true,
          rewardPaid: true,
          referrerTelegramId: referrerTelegramId.toString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      rewardPaid: false,
    });
  } catch (error: any) {
    console.error('[Referral Check API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

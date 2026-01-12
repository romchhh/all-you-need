import { prisma } from '@/lib/prisma';

/**
 * Отримує налаштування системи за ключем
 */
export async function getSystemSetting<T = any>(key: string, defaultValue: T): Promise<T> {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT value FROM SystemSettings WHERE key = ?`,
      key
    ) as Array<{ value: string }>;
    
    if (result.length === 0) {
      return defaultValue;
    }
    
    return JSON.parse(result[0].value);
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Зберігає налаштування системи
 */
export async function setSystemSetting(
  key: string, 
  value: any, 
  description?: string
): Promise<void> {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const existing = await prisma.$queryRawUnsafe(
    `SELECT id FROM SystemSettings WHERE key = ?`,
    key
  ) as Array<{ id: number }>;

  if (existing.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE SystemSettings 
       SET value = ?, description = ?, updatedAt = ?
       WHERE key = ?`,
      valueStr,
      description || null,
      now,
      key
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO SystemSettings (key, value, description, updatedAt)
       VALUES (?, ?, ?, ?)`,
      key,
      valueStr,
      description || null,
      now
    );
  }
}

/**
 * Отримує всі налаштування системи
 */
export async function getAllSystemSettings(): Promise<Record<string, any>> {
  const settings = await prisma.$queryRawUnsafe(
    `SELECT key, value FROM SystemSettings`
  ) as Array<{ key: string; value: string }>;
  
  const settingsObj: Record<string, any> = {};
  settings.forEach(setting => {
    try {
      settingsObj[setting.key] = JSON.parse(setting.value);
    } catch {
      settingsObj[setting.key] = setting.value;
    }
  });
  
  return settingsObj;
}

/**
 * Створює транзакцію в базі даних
 */
export async function createTransaction(params: {
  userId: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;
  
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Transaction" (userId, type, amount, currency, status, description, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params.userId,
    params.type,
    params.amount,
    params.currency,
    params.status,
    params.description,
    metadata,
    now
  );
}

/**
 * Безпечне виконання SQL з IN clause
 */
export async function executeInClause(
  query: string,
  values: (string | number)[]
): Promise<void> {
  if (values.length === 0) return;
  
  const placeholders = values.map(() => '?').join(',');
  const fullQuery = query.replace('IN (?)', `IN (${placeholders})`);
  
  await prisma.$executeRawUnsafe(fullQuery, ...values);
}

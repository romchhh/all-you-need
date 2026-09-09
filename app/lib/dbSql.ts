/**
 * SQL helpers for SQLite / PostgreSQL compatibility in raw Prisma queries.
 */

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/** null = OK; string = misconfiguration message for logs/UI */
export function getDatabaseConfigError(): string | null {
  if (isPostgres()) return null;
  const url = process.env.DATABASE_URL ?? '';
  if (url.startsWith('file:')) {
    return (
      'DATABASE_URL points to SQLite (file:...) but prisma/schema.prisma uses postgresql. ' +
      'Start Postgres (docker compose up postgres -d) and set e.g. ' +
      'DATABASE_URL=postgresql://ayn:ayn_dev_password@localhost:5432/ayn_marketplace?schema=public'
    );
  }
  if (!url) {
    return 'DATABASE_URL is not set. Configure a postgresql:// connection string.';
  }
  return `DATABASE_URL must start with postgresql:// or postgres:// (got: ${url.split('://')[0] || 'unknown'}://)`;
}

export function quoteTable(name: string): string {
  if (isPostgres()) {
    return `"${name}"`;
  }
  return name === 'Transaction' ? '[Transaction]' : name;
}

export function sqlNow(): string {
  return isPostgres() ? 'NOW()' : "datetime('now')";
}

export function sqlNowMinusDays(days: number): string {
  return isPostgres()
    ? `NOW() - INTERVAL '${days} days'`
    : `datetime('now', '-${days} days')`;
}

export function sqlDatetimeCompare(column: string): string {
  if (isPostgres()) {
    return `${column} > NOW()`;
  }
  return `datetime(${column}) > datetime('now')`;
}

export function sqlDatetimeGte(column: string, paramPlaceholder: string): string {
  if (isPostgres()) {
    return `${column} >= ${paramPlaceholder}::timestamp`;
  }
  return `datetime(${column}) >= datetime(${paramPlaceholder})`;
}

export function sqlDatetimeLte(column: string, paramPlaceholder: string): string {
  if (isPostgres()) {
    return `${column} <= ${paramPlaceholder}::timestamp`;
  }
  return `datetime(${column}) <= datetime(${paramPlaceholder})`;
}

export function tableInfoQuery(table: string): string {
  if (isPostgres()) {
    return `
      SELECT column_name AS name, data_type AS type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
    `;
  }
  return `PRAGMA table_info(${table})`;
}

export function tableExistsQuery(table: string): string {
  if (isPostgres()) {
    return `
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = 'public' AND tablename = '${table}'
    `;
  }
  return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
}

/** Prisma PG tables (PascalCase, quoted in DDL). */
const PRISMA_PG_TABLES = [
  'User',
  'Listing',
  'Favorite',
  'ViewHistory',
  'Transaction',
  'Payment',
  'Review',
  'Category',
  'Admin',
  'Link',
  'TelegramListing',
  'CitySubscription',
  'AnalyticsEvent',
  'SystemMonitorLog',
  'SystemSettings',
  'ListingPackagePurchase',
  'PromotionPurchase',
  'Referral',
  'UserSession',
  'CityDigestQueue',
];

/** Prisma columns stored as quoted camelCase in PostgreSQL. */
const PRISMA_PG_COLUMNS = [
  'userId',
  'telegramId',
  'firstName',
  'lastName',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'moderatedAt',
  'moderatedBy',
  'optimizedImages',
  'promotionType',
  'promotionEnds',
  'isFree',
  'previousPrice',
  'priceChangedAt',
  'favoriteBoost',
  'subcategory',
  'moderationStatus',
  'rejectionReason',
  'listingId',
  'viewerTelegramId',
  'viewedAt',
  'targetId',
  'eventName',
  'eventGroup',
  'entityType',
  'entityId',
  'lastActiveAt',
  'sortOrder',
  'parentId',
  'isActive',
  'linkName',
  'linkUrl',
  'linkCount',
  'hasUsedFreeAd',
  'agreementAccepted',
  'listingPackagesBalance',
  'autoRenew',
  'expiresAt',
  'priceDisplay',
  'channelMessageId',
  'marketplaceListingId',
  'reviewsCount',
  'paymentMethod',
  'completedAt',
  'invoiceId',
  'amountEur',
  'pageUrl',
  'webhookData',
  'packageType',
  'listingsCount',
  'paidAt',
  'cityKey',
  'processedAt',
  'referrerTelegramId',
  'referredTelegramId',
  'rewardPaid',
  'rewardPaidAt',
  'sellerTelegramId',
];

function quotePgIdentifiers(sql: string): string {
  let s = sql;

  for (const table of PRISMA_PG_TABLES) {
    s = s.replace(
      new RegExp(`\\bCREATE TABLE IF NOT EXISTS ${table}\\b`, 'gi'),
      `CREATE TABLE IF NOT EXISTS "${table}"`
    );
    s = s.replace(new RegExp(`\\bFROM ${table}\\b`, 'gi'), `FROM "${table}"`);
    s = s.replace(new RegExp(`\\bJOIN ${table}\\b`, 'gi'), `JOIN "${table}"`);
    s = s.replace(new RegExp(`\\bUPDATE ${table}\\b`, 'gi'), `UPDATE "${table}"`);
    s = s.replace(new RegExp(`\\bINTO ${table}\\b`, 'gi'), `INTO "${table}"`);
    s = s.replace(new RegExp(`\\bDELETE FROM ${table}\\b`, 'gi'), `DELETE FROM "${table}"`);
    s = s.replace(new RegExp(`\\bON ${table}\\(`, 'gi'), `ON "${table}"(`);
  }

  for (const col of PRISMA_PG_COLUMNS) {
    s = s.replace(new RegExp(`\\.${col}\\b`, 'g'), `."${col}"`);
    s = s.replace(new RegExp(`(?<![."\\w])${col}\\b`, 'g'), `"${col}"`);
  }

  const BOOLEAN_PG_COLUMNS = [
    'isFree',
    'isActive',
    'isSuperadmin',
    'hasUsedFreeAd',
    'agreementAccepted',
    'autoRenew',
    'rewardPaid',
  ];
  for (const col of BOOLEAN_PG_COLUMNS) {
    s = s.replace(new RegExp(`"${col}"\\s*=\\s*1\\b`, 'gi'), `"${col}" = true`);
    s = s.replace(new RegExp(`\\."${col}"\\s*=\\s*1\\b`, 'gi'), `."${col}" = true`);
    s = s.replace(new RegExp(`(?<![."\\w])${col}\\s*=\\s*1\\b`, 'gi'), `"${col}" = true`);
    s = s.replace(new RegExp(`"${col}"\\s*=\\s*0\\b`, 'gi'), `"${col}" = false`);
    s = s.replace(new RegExp(`\\."${col}"\\s*=\\s*0\\b`, 'gi'), `."${col}" = false`);
    s = s.replace(new RegExp(`(?<![."\\w])${col}\\s*=\\s*0\\b`, 'gi'), `"${col}" = false`);
    s = s.replace(
      new RegExp(`COALESCE\\s*\\(\\s*"${col}"\\s*,\\s*0\\s*\\)`, 'gi'),
      `COALESCE("${col}", false)`
    );
    s = s.replace(
      new RegExp(`COALESCE\\s*\\(\\s*((?:[a-zA-Z_]\\w*\\.)?"${col}")\\s*,\\s*0\\s*\\)`, 'gi'),
      'COALESCE($1, false)'
    );
    s = s.replace(
      new RegExp(`COALESCE\\s*\\(\\s*((?:[a-zA-Z_]\\w*\\.)?${col})\\s*,\\s*0\\s*\\)`, 'gi'),
      'COALESCE($1, false)'
    );
    s = s.replace(
      new RegExp(`COALESCE\\s*\\(\\s*((?:[a-zA-Z_]\\w*\\.)?"${col}")\\s*,\\s*false\\s*\\)\\s*=\\s*1\\b`, 'gi'),
      'COALESCE($1, false) = true'
    );
    s = s.replace(
      new RegExp(`COALESCE\\s*\\(\\s*((?:[a-zA-Z_]\\w*\\.)?"${col}")\\s*,\\s*false\\s*\\)\\s*=\\s*0\\b`, 'gi'),
      'COALESCE($1, false) = false'
    );
  }
  s = s.replace(/,\s*1\s*,\s*(CURRENT_TIMESTAMP|NOW\(\))/gi, ', true, $1');
  s = s.replace(/VALUES\s*\(([^)]*),\s*1\s*\)/gi, 'VALUES ($1, true)');

  s = s.replace(/\bAS REAL\b/gi, 'AS DOUBLE PRECISION');
  s = s.replace(/CAST\(([^)]+)\s+AS\s+INTEGER\)/gi, '($1)::bigint');

  return s;
}

export function adaptSql(sql: string): string {
  if (!isPostgres()) return sql;

  let s = sql;
  s = s.replace(/\[Transaction\]/g, '"Transaction"');
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  s = s.replace(/datetime\('now',\s*'-(\d+)\s+days'\)/gi, "NOW() - INTERVAL '$1 days'");
  s = s.replace(
    /datetime\('now',\s*'start of day',\s*'localtime'\)/gi,
    "DATE_TRUNC('day', NOW())"
  );
  s = s.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
  s = s.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  s = s.replace(/datetime\('now',\s*\?\)/gi, 'NOW() + CAST(? AS INTERVAL)');
  s = s.replace(/ON CONFLICT\s*\(/gi, 'ON CONFLICT (');
  s = s.replace(
    /SELECT name FROM sqlite_master WHERE type='table' AND name='([^']+)'/gi,
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename = '$1'"
  );
  s = s.replace(/PRAGMA table_info\(([^)]+)\)/gi, (_m, table: string) => {
    const t = table.trim().replace(/['"]/g, '');
    return `
      SELECT column_name AS name, data_type AS type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${t}'
    `;
  });
  s = s.replace(/datetime\(([^)]+)\)\s*>\s*NOW\(\)/gi, '$1 > NOW()');
  s = s.replace(/datetime\(([^)]+)\)\s*>\s*datetime\('now'\)/gi, '$1 > NOW()');
  s = s.replace(/datetime\(([^)]+)\)/gi, '$1::timestamp');
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  s = s.replace(/\bINSTR\s*\(/gi, 'STRPOS(');

  s = quotePgIdentifiers(s);

  // CREATE INDEX ON "Listing"("publishedAt", "createdAt" DESC)
  s = s.replace(/\bON "([A-Z][a-zA-Z]+)"\(([^)]+)\)/g, (_m, table, colList: string) => {
    const cols = colList.split(',').map((part) => {
      const trimmed = part.trim();
      const descMatch = trimmed.match(/^(\w+)(\s+DESC)?$/i);
      if (!descMatch) return trimmed;
      const [, col, desc = ''] = descMatch;
      return PRISMA_PG_COLUMNS.includes(col) ? `"${col}"${desc}` : trimmed;
    });
    return `ON "${table}"(${cols.join(', ')})`;
  });

  return s;
}

/** Convert `?` placeholders to `$1..$n` for PostgreSQL raw queries. */
export function toPgParams(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const adapted = adaptSql(sql);
  if (!isPostgres()) return { sql: adapted, params };
  let i = 0;
  const pgSql = adapted.replace(/\?/g, () => `$${++i}`);
  return { sql: pgSql, params };
}

export async function rawQuery<T>(
  prisma: { $queryRawUnsafe: (sql: string, ...params: unknown[]) => Promise<T> },
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const { sql: q, params: p } = toPgParams(sql, params);
  return prisma.$queryRawUnsafe(q, ...p);
}

export async function rawExecute(
  prisma: { $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<number> },
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const { sql: q, params: p } = toPgParams(sql, params);
  return prisma.$executeRawUnsafe(q, ...p);
}

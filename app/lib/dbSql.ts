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

/** users_legacy.user_id is NUMERIC on PostgreSQL; telegram ids are passed as numbers. */
export function usersLegacyTelegramIdWhere(param = '?'): string {
  if (isPostgres()) {
    return `user_id = ${param}::numeric`;
  }
  return `user_id = ${param}`;
}

/** SQLite stores booleans as 0/1; PostgreSQL uses true/false. */
export function normalizePgBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

const PG_TIMESTAMP_COLUMNS = [
  'updatedAt',
  'createdAt',
  'publishedAt',
  'moderatedAt',
  'viewedAt',
  'expiresAt',
  'paidAt',
  'startsAt',
  'endsAt',
  'completedAt',
  'lastActiveAt',
  'priceChangedAt',
  'subscriptionEndsAt',
  'processedAt',
  'rewardPaidAt',
  'promotionEnds',
  'addedDate',
  'checkedAt',
];

const PG_TIMESTAMP_COLUMN_SET = new Set(PG_TIMESTAMP_COLUMNS);

function findMatchingParen(sql: string, openIndex: number): number {
  let depth = 0;
  let inQuote = false;
  for (let i = openIndex; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== '\\') inQuote = !inQuote;
    if (inQuote) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitSqlList(list: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "'" && list[i - 1] !== '\\') inQuote = !inQuote;
    if (!inQuote) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      else if (ch === ',' && depth === 0) {
        out.push(buf);
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  if (buf.length > 0 || out.length > 0) out.push(buf);
  return out;
}

function castPgTimestampAssignments(sql: string): string {
  let s = sql;
  for (const col of PG_TIMESTAMP_COLUMNS) {
    s = s.replace(new RegExp(`"${col}"\\s*=\\s*\\?(?!::)`, 'gi'), `"${col}" = ?::timestamp`);
  }
  return s;
}

/** Cast `?` placeholders that correspond to timestamp columns in INSERT ... VALUES. */
function castPgTimestampInserts(sql: string): string {
  const re = /INSERT\s+INTO\s+(?:"[A-Za-z_]+"|[A-Za-z_]+)\s*\(/gi;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(sql))) {
    const colsOpen = re.lastIndex - 1;
    const colsClose = findMatchingParen(sql, colsOpen);
    if (colsClose < 0) continue;

    const afterCols = sql.slice(colsClose + 1);
    const valuesKw = afterCols.match(/^\s*VALUES\s*\(/i);
    if (!valuesKw) continue;

    const valuesOpen = colsClose + 1 + valuesKw[0].lastIndexOf('(');
    const valuesClose = findMatchingParen(sql, valuesOpen);
    if (valuesClose < 0) continue;

    const cols = splitSqlList(sql.slice(colsOpen + 1, colsClose)).map((c) =>
      c.trim().replace(/"/g, '')
    );
    const values = splitSqlList(sql.slice(valuesOpen + 1, valuesClose));
    if (cols.length !== values.length) {
      re.lastIndex = valuesClose + 1;
      continue;
    }

    const nextValues = values.map((value, i) => {
      const trimmed = value.trim();
      if (PG_TIMESTAMP_COLUMN_SET.has(cols[i]) && trimmed === '?') {
        return `${value.replace('?', '?::timestamp')}`;
      }
      return value;
    });

    result += sql.slice(lastIndex, valuesOpen + 1) + nextValues.join(',') + ')';
    lastIndex = valuesClose + 1;
    re.lastIndex = valuesClose + 1;
  }

  return result + sql.slice(lastIndex);
}

function coercePgDatetimeParam(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    const parsed = new Date(`${value.replace(' ', 'T')}Z`);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  return value;
}

export function tableInfoQuery(table: string): string {
  if (isPostgres()) {
    return `
      SELECT column_name AS name, data_type AS type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name = '${table}' OR table_name = lower('${table}'))
    `;
  }
  return `PRAGMA table_info(${table})`;
}

export function tableExistsQuery(table: string): string {
  if (isPostgres()) {
    return `
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename = '${table}' OR tablename = lower('${table}'))
    `;
  }
  return `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`;
}

/** Місто з Listing.location: частина до першої коми. */
export function listingCityExtractExpr(column = 'location'): string {
  if (isPostgres()) {
    return `TRIM(SPLIT_PART(${column} || ',', ',', 1))`;
  }
  return `TRIM(SUBSTR(${column} || ',', 1, INSTR(${column} || ',', ',') - 1))`;
}

/** Prisma PG tables (PascalCase, quoted in DDL). Longest first so UserSession ≠ User. */
const PRISMA_PG_TABLES = [
  'BusinessSubscriptionPurchase',
  'ListingPackagePurchase',
  'SystemMonitorLog',
  'TelegramListing',
  'CityDigestQueue',
  'CitySubscription',
  'PromotionPurchase',
  'BusinessProfile',
  'BusinessFollow',
  'AnalyticsEvent',
  'SystemSettings',
  'ViewHistory',
  'UserSession',
  'Transaction',
  'Referral',
  'Favorite',
  'Category',
  'Payment',
  'Listing',
  'Review',
  'Admin',
  'User',
  'Link',
];

/** Prisma columns + SELECT aliases stored/used as camelCase. Longest first. */
const PRISMA_PG_COLUMNS = [
  'highlightCreditsRemaining',
  'topCreditsRemaining',
  'listingPackagesBalance',
  'marketplaceListingId',
  'subscriptionEndsAt',
  'referrerTelegramId',
  'referredTelegramId',
  'businessProfileId',
  'channelMessageId',
  'moderationStatus',
  'publicationTariff',
  'sellerTelegramId',
  'viewerTelegramId',
  'followerUserId',
  'linkedListingIds',
  'followersCount',
  'optimizedImages',
  'promotionType',
  'promotionEnds',
  'previousPrice',
  'priceChangedAt',
  'rejectionReason',
  'favoriteBoost',
  'hasUsedFreeAd',
  'agreementAccepted',
  'reviewsCount',
  'paymentMethod',
  'paymentStatus',
  'packageType',
  'listingsCount',
  'sellerFirstName',
  'sellerLastName',
  'sellerUsername',
  'sellerAvatar',
  'sellerPhone',
  'favoritesCount',
  'subscriptionStatus',
  'serviceRadiusKm',
  'workingHours',
  'coverImage',
  'businessName',
  'profileType',
  'serviceArea',
  'isPublished',
  'isSuperadmin',
  'priceDisplay',
  'rewardPaidAt',
  'lastActiveAt',
  'startsAt',
  'endsAt',
  'paidAt',
  'cityKey',
  'processedAt',
  'webhookData',
  'completedAt',
  'invoiceId',
  'amountEur',
  'pageUrl',
  'eventName',
  'eventGroup',
  'entityType',
  'entityId',
  'targetId',
  'sortOrder',
  'parentId',
  'linkName',
  'linkUrl',
  'linkCount',
  'userAgent',
  'ipAddress',
  'addedDate',
  'addedBy',
  'updatedBy',
  'checkedAt',
  'serviceName',
  'latencyMs',
  'listingId',
  'viewedAt',
  'expiresAt',
  'autoRenew',
  'subcategory',
  'telegramId',
  'firstName',
  'lastName',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'moderatedAt',
  'moderatedBy',
  'isActive',
  'isFree',
  'userId',
  'rewardPaid',
];

/** SELECT-аліаси, які не можна брати в лапки в ORDER BY / HAVING (PostgreSQL). */
const PG_SELECT_OUTPUT_ALIASES = [
  'listingsCount',
  'activeListingsCount',
  'totalViews',
  'totalPurchases',
  'totalRevenue',
  'totalAmount',
  'totalTopUps',
  'balanceRevenue',
  'directRevenue',
  'count',
];

function fixPgAggregateAliases(sql: string): string {
  let s = sql;
  for (const alias of PG_SELECT_OUTPUT_ALIASES) {
    s = s.replace(new RegExp(`\\bas\\s+"${alias}"(?=\\s|,|$|\\))`, 'gi'), `as ${alias}`);
    s = s.replace(new RegExp(`\\bORDER BY\\s+"${alias}"\\s+(ASC|DESC)\\b`, 'gi'), `ORDER BY ${alias} $1`);
    s = s.replace(new RegExp(`\\bORDER BY\\s+"${alias}"\\b`, 'gi'), `ORDER BY ${alias}`);
  }
  s = s.replace(/\bHAVING\s+"listingsCount"\s*>\s*0\b/gi, 'HAVING COUNT(l.id) > 0');
  s = s.replace(/\bHAVING\s+listingsCount\s*>\s*0\b/gi, 'HAVING COUNT(l.id) > 0');
  return s;
}

function quotePgBareIdent(sql: string, ident: string): string {
  const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  sql = sql.replace(new RegExp(`\\.${escaped}(?![A-Za-z0-9_])`, 'g'), `."${ident}"`);
  return sql.replace(new RegExp(`(?<![A-Za-z0-9_."])${escaped}(?![A-Za-z0-9_])`, 'g'), `"${ident}"`);
}

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

  const cols = [...PRISMA_PG_COLUMNS].sort((a, b) => b.length - a.length);
  for (const col of cols) {
    s = quotePgBareIdent(s, col);
  }

  const BOOLEAN_PG_COLUMNS = [
    'isFree',
    'isActive',
    'isSuperadmin',
    'hasUsedFreeAd',
    'agreementAccepted',
    'autoRenew',
    'isPublished',
  ];
  for (const col of BOOLEAN_PG_COLUMNS) {
    s = s.replace(new RegExp(`"${col}"\\s*=\\s*1\\b`, 'gi'), `"${col}" = true`);
    s = s.replace(new RegExp(`\\."${col}"\\s*=\\s*1\\b`, 'gi'), `."${col}" = true`);
    s = s.replace(new RegExp(`(?<![A-Za-z0-9_."])${col}\\s*=\\s*1\\b`, 'gi'), `"${col}" = true`);
    s = s.replace(new RegExp(`"${col}"\\s*=\\s*0\\b`, 'gi'), `"${col}" = false`);
    s = s.replace(new RegExp(`\\."${col}"\\s*=\\s*0\\b`, 'gi'), `."${col}" = false`);
    s = s.replace(new RegExp(`(?<![A-Za-z0-9_."])${col}\\s*=\\s*0\\b`, 'gi'), `"${col}" = false`);
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
  s = s.replace(/datetime\('now',\s*'-(\d+)\s+hours'\)/gi, "NOW() - INTERVAL '$1 hours'");
  s = s.replace(/datetime\('now',\s*'-(\d+)\s+days'\)/gi, "NOW() - INTERVAL '$1 days'");
  s = s.replace(/datetime\('now',\s*'\+(\d+)\s+days'\)/gi, "NOW() + INTERVAL '$1 days'");
  s = s.replace(
    /datetime\('now',\s*'start of day',\s*'localtime'\)/gi,
    "DATE_TRUNC('day', NOW())"
  );
  s = s.replace(/datetime\(([^,)]+),\s*'-(\d+)\s+days'\)/gi, "$1 - INTERVAL '$2 days'");
  s = s.replace(/datetime\(([^,)]+),\s*'-(\d+)\s+hours'\)/gi, "$1 - INTERVAL '$2 hours'");
  s = s.replace(/datetime\(([^,)]+),\s*'\+(\d+)\s+days'\)/gi, "$1 + INTERVAL '$2 days'");
  s = s.replace(/datetime\(([^,)]+),\s*\?\)/gi, '$1 + CAST(? AS INTERVAL)');
  s = s.replace(/datetime\(\?\)/gi, '?::timestamp');
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
      WHERE table_schema = 'public'
        AND (table_name = '${t}' OR table_name = lower('${t}'))
    `;
  });
  s = s.replace(/datetime\(([^)]+)\)\s*>\s*NOW\(\)/gi, '$1 > NOW()');
  s = s.replace(/datetime\(([^)]+)\)\s*>\s*datetime\('now'\)/gi, '$1 > NOW()');
  s = s.replace(/datetime\(([^)]+)\)/gi, '$1::timestamp');
  s = s.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  // users_legacy.user_id is NUMERIC in production PostgreSQL
  s = s.replace(/\buser_id\s*=\s*\?/gi, 'user_id = ?::numeric');
  s = s.replace(/\bINSTR\s*\(/gi, 'STRPOS(');
  s = s.replace(
    /\bSUBSTR\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\)/gi,
    'SUBSTRING($1 FROM $2 FOR $3)'
  );

  s = quotePgIdentifiers(s);
  s = castPgTimestampAssignments(s);
  s = castPgTimestampInserts(s);
  s = fixPgAggregateAliases(s);

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
  return { sql: pgSql, params: params.map(coercePgDatetimeParam) };
}

export async function rawQuery<T>(
  prisma: { $queryRawUnsafe: (sql: string, ...params: unknown[]) => Promise<T> },
  sql: string,
  params: unknown[] = []
): Promise<T> {
  // prisma.$queryRawUnsafe is already patched with toPgParams in lib/prisma.ts
  return prisma.$queryRawUnsafe(sql, ...params);
}

export async function rawExecute(
  prisma: { $executeRawUnsafe: (sql: string, ...params: unknown[]) => Promise<number> },
  sql: string,
  params: unknown[] = []
): Promise<number> {
  return prisma.$executeRawUnsafe(sql, ...params);
}

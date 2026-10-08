export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export type DaySchedule = {
  open: boolean;
  from: string;
  to: string;
};

export type WorkingHoursSettings = {
  show: boolean;
  days: Record<WeekdayKey, DaySchedule>;
};

export type ListingDisplayMode = 'all' | 'manual';

export type ListingDisplayConfig = {
  mode: ListingDisplayMode;
  ids: number[];
};

const DEFAULT_DAY: DaySchedule = { open: true, from: '09:00', to: '19:00' };

export const DEFAULT_WORKING_HOURS: WorkingHoursSettings = {
  show: true,
  days: {
    mon: { ...DEFAULT_DAY },
    tue: { ...DEFAULT_DAY },
    wed: { ...DEFAULT_DAY },
    thu: { ...DEFAULT_DAY },
    fri: { ...DEFAULT_DAY },
    sat: { ...DEFAULT_DAY },
    sun: { open: false, from: '09:00', to: '19:00' },
  },
};

export function isWorkingHoursJson(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  return trimmed.startsWith('{') && trimmed.includes('"days"');
}

export function parseWorkingHoursSettings(raw: string | null | undefined): WorkingHoursSettings {
  if (!raw || !isWorkingHoursJson(raw)) {
    if (raw?.trim()) {
      return { ...DEFAULT_WORKING_HOURS, show: true };
    }
    return { ...DEFAULT_WORKING_HOURS };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkingHoursSettings>;
    const days = { ...DEFAULT_WORKING_HOURS.days };
    if (parsed.days && typeof parsed.days === 'object') {
      for (const key of WEEKDAY_KEYS) {
        const day = parsed.days[key];
        if (day && typeof day === 'object') {
          days[key] = {
            open: Boolean(day.open),
            from: typeof day.from === 'string' ? day.from : DEFAULT_DAY.from,
            to: typeof day.to === 'string' ? day.to : DEFAULT_DAY.to,
          };
        }
      }
    }
    return {
      show: parsed.show !== false,
      days,
    };
  } catch {
    return { ...DEFAULT_WORKING_HOURS };
  }
}

export function serializeWorkingHoursSettings(settings: WorkingHoursSettings): string {
  return JSON.stringify(settings);
}

export function formatWorkingHoursForDisplay(
  raw: string | null | undefined,
  labels: Record<WeekdayKey, string>,
  dayOffLabel: string
): string | null {
  if (!raw?.trim()) return null;

  if (!isWorkingHoursJson(raw)) {
    return raw.trim();
  }

  const settings = parseWorkingHoursSettings(raw);
  if (!settings.show) return null;

  return WEEKDAY_KEYS.map((key) => {
    const day = settings.days[key];
    const name = labels[key] || key;
    if (!day.open) return `${name}: ${dayOffLabel}`;
    return `${name}: ${day.from} – ${day.to}`;
  }).join('\n');
}

export function parseListingDisplayConfig(raw: string | null | undefined): ListingDisplayConfig {
  if (!raw) return { mode: 'all', ids: [] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as { mode?: string; ids?: unknown[] };
      if (obj.mode === 'all') return { mode: 'all', ids: [] };
      if (obj.mode === 'manual' && Array.isArray(obj.ids)) {
        return {
          mode: 'manual',
          ids: obj.ids.map((id) => parseInt(String(id), 10)).filter((id) => Number.isFinite(id)),
        };
      }
    }
    if (Array.isArray(parsed)) {
      return {
        mode: 'manual',
        ids: parsed.map((id) => parseInt(String(id), 10)).filter((id) => Number.isFinite(id)),
      };
    }
  } catch {
    // legacy comma-separated fallback
    const ids = raw
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id));
    if (ids.length > 0) return { mode: 'manual', ids };
  }

  return { mode: 'all', ids: [] };
}

export function serializeListingDisplayConfig(mode: ListingDisplayMode, ids: number[]): string {
  if (mode === 'all') return JSON.stringify({ mode: 'all' });
  return JSON.stringify({ mode: 'manual', ids });
}

/** Backward-compatible helper used across the codebase. */
export function parseLinkedListingIds(raw: string | null | undefined): number[] {
  return parseListingDisplayConfig(raw).ids;
}

export type PortfolioImageItem = {
  url: string;
  description?: string;
};

export const PORTFOLIO_MAX = 12;
export const PORTFOLIO_DESCRIPTION_MAX = 200;

function normalizePortfolioUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizePortfolioDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, PORTFOLIO_DESCRIPTION_MAX);
  return trimmed || undefined;
}

/** Парсить JSON портфоліо: рядки або об'єкти { url, description }. */
export function parsePortfolioItems(raw: string | null | undefined): PortfolioImageItem[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const items: PortfolioImageItem[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      let url = '';
      let description: string | undefined;
      if (typeof entry === 'string') {
        url = normalizePortfolioUrl(entry);
      } else if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        url = normalizePortfolioUrl(obj.url ?? obj.path ?? obj.src);
        description = normalizePortfolioDescription(obj.description ?? obj.caption);
      }
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push(description ? { url, description } : { url });
      if (items.length >= PORTFOLIO_MAX) break;
    }
    return items;
  } catch {
    return [];
  }
}

/** Лише URL (для зворотної сумісності). */
export function parsePortfolioImages(raw: string | null | undefined): string[] {
  return parsePortfolioItems(raw).map((item) => item.url);
}

export function serializePortfolioItems(
  items: Array<PortfolioImageItem | string | null | undefined>
): string {
  const seen = new Set<string>();
  const normalized: PortfolioImageItem[] = [];
  for (const entry of items) {
    if (entry == null) continue;
    const url = typeof entry === 'string' ? normalizePortfolioUrl(entry) : normalizePortfolioUrl(entry.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const description =
      typeof entry === 'string' ? undefined : normalizePortfolioDescription(entry.description);
    normalized.push(description ? { url, description } : { url });
    if (normalized.length >= PORTFOLIO_MAX) break;
  }
  // Якщо описів немає — зберігаємо як масив рядків (компактніше / сумісність)
  if (normalized.every((item) => !item.description)) {
    return JSON.stringify(normalized.map((item) => item.url));
  }
  return JSON.stringify(normalized);
}

export function serializePortfolioImages(paths: string[]): string {
  return serializePortfolioItems(paths);
}

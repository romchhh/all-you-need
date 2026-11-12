import groupsJson from '@/data/parser-share-groups.json';
import { foldCityKey } from '@/lib/city/cityNormalization';

export type ParserShareGroup = {
  parserKey: string;
  title: string;
  city: string;
  kind: 'goods' | 'services';
  categorySlug: string | null;
  inviteLink: string;
  notes: string | null;
};

const PARSER_GROUPS: ParserShareGroup[] = groupsJson as ParserShareGroup[];

export function getParserShareGroups(): ParserShareGroup[] {
  return PARSER_GROUPS;
}

export function findParserShareGroup(parserKey: string): ParserShareGroup | undefined {
  const want = parserKey.trim().toLowerCase();
  return PARSER_GROUPS.find((g) => g.parserKey.toLowerCase() === want);
}

/** Стабільний id для UI (не з БД). */
export function stableParserChatId(parserKey: string): number {
  let h = 0;
  for (let i = 0; i < parserKey.length; i++) {
    h = (h * 31 + parserKey.charCodeAt(i)) >>> 0;
  }
  return 8_000_000 + (h % 1_000_000);
}

function listingLooksLikeService(listingCategory: string): boolean {
  const c = (listingCategory || '').toLowerCase();
  return (
    c.includes('service') ||
    c.includes('beauty') ||
    c.includes('job') ||
    c === 'other_services'
  );
}

export function listParserShareGroupsForListing(params: {
  listingCityFold: string;
  listingCategory: string;
  categoryFilter: string | null;
  cityFilter: string | null;
}): Array<ParserShareGroup & { relevance: number; memberCount: number }> {
  const cityFilterRaw = (params.cityFilter || '').trim();
  const cityWant =
    cityFilterRaw === '__all__'
      ? ''
      : cityFilterRaw
        ? foldCityKey(cityFilterRaw)
        : params.listingCityFold
          ? foldCityKey(params.listingCityFold)
          : '';

  const catWant =
    params.categoryFilter && params.categoryFilter !== 'all' ? params.categoryFilter : null;

  const preferServices = listingLooksLikeService(params.listingCategory);

  const scored: Array<ParserShareGroup & { relevance: number; memberCount: number }> = [];

  for (const g of PARSER_GROUPS) {
    const cityFold = foldCityKey(g.city);

    if (catWant && g.categorySlug && g.categorySlug !== catWant) {
      continue;
    }

    let relevance = g.kind === 'goods' ? 20 : 10;
    if (preferServices && g.kind === 'services') relevance += 15;
    if (!preferServices && g.kind === 'goods') relevance += 15;

    if (cityWant) {
      if (cityFold === cityWant) {
        relevance += 120;
      } else if (g.city === 'Germany' || g.city === 'Deutschland') {
        relevance += 40;
      } else {
        continue;
      }
    }

    scored.push({
      ...g,
      relevance,
      memberCount: 0,
    });
  }

  scored.sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));

  if (scored.length === 0 && cityWant) {
    for (const g of PARSER_GROUPS) {
      if (catWant && g.categorySlug && g.categorySlug !== catWant) continue;
      scored.push({
        ...g,
        relevance: foldCityKey(g.city) === cityWant ? 50 : 0,
        memberCount: 0,
      });
    }
    scored.sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title));
  }

  if (scored.length === 0) {
    return PARSER_GROUPS.map((g) => ({
      ...g,
      relevance: 0,
      memberCount: 0,
    }));
  }

  return scored;
}

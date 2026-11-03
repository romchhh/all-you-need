/**
 * Ранжування «схожих» оголошень:
 * модель/бренд → підкатегорія → розмір → ціна → категорія.
 */

export type SimilarSource = {
  id: number;
  title: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  price: string | number | null;
  isFree?: boolean | number | string | null;
};

export type SimilarCandidate = SimilarSource & {
  location?: string | null;
  createdAt?: string | Date | null;
};

const STOPWORDS = new Set(
  [
    // uk
    'продаю', 'продаж', 'віддам', 'віддам', 'даром', 'ціна', 'стан', 'новий', 'нова', 'нове',
    'бв', 'б/у', 'бу', 'майже', 'дуже', 'гарний', 'гарна', 'добрий', 'добра', 'торг', 'самовивіз',
    'доставка', 'розмір', 'колір', 'для', 'або', 'та', 'із', 'від', 'про', 'без', 'ще', 'є',
    // ru
    'продаю', 'продажа', 'отдам', 'даром', 'цена', 'состояние', 'новый', 'новая', 'новое',
    'почти', 'очень', 'хороший', 'хорошая', 'торг', 'самовывоз', 'доставка', 'размер', 'цвет',
    'для', 'или', 'и', 'из', 'от', 'про', 'без', 'есть',
    // de / en
    'verkaufe', 'gesucht', 'abzugeben', 'preis', 'zustand', 'neu', 'gebraucht', 'größe', 'grosse',
    'farbe', 'für', 'oder', 'und', 'mit', 'ohne', 'sell', 'selling', 'for', 'the', 'and', 'with',
    'size', 'color', 'colour', 'free', 'shipping',
  ].map((w) => w.toLowerCase())
);

/** Популярні автобренди (DE/UA ринок). */
export const CAR_BRANDS = [
  'bmw', 'mercedes', 'mercedes-benz', 'mercedesbenz', 'audi', 'volkswagen', 'vw', 'opel', 'ford',
  'toyota', 'skoda', 'škoda', 'renault', 'peugeot', 'citroen', 'citroën', 'hyundai', 'kia',
  'nissan', 'mazda', 'honda', 'volvo', 'seat', 'cupra', 'mini', 'porsche', 'tesla', 'fiat',
  'dacia', 'suzuki', 'mitsubishi', 'subaru', 'jeep', 'land rover', 'landrover', 'range rover',
  'rangerover', 'lexus', 'infiniti', 'chevrolet', 'dodge', 'chrysler', 'alfa romeo', 'alfaromeo',
  'smart', 'iveco', 'man', 'scania',
] as const;

/** Часті fashion-бренди. */
export const FASHION_BRANDS = [
  'nike', 'adidas', 'puma', 'reebok', 'new balance', 'newbalance', 'asics', 'converse', 'vans',
  'timberland', 'dr martens', 'drmartens', 'zara', 'h&m', 'hm', 'mango', 'uniqlo', 'bershka',
  'pull&bear', 'stradivarius', 'reserved', 'cropp', 'sinsay', 'house', 'lc waikiki', 'defacto',
  'gucci', 'prada', 'louis vuitton', 'lv', 'chanel', 'dior', 'balenciaga', 'versace', 'armani',
  'hugo boss', 'hugoboss', 'tommy', 'tommy hilfiger', 'calvin klein', 'calvinklein', 'levis',
  "levi's", 'wrangler', 'lee', 'the north face', 'northface', 'columbia', 'patagonia',
  'decathlon', 'skechers', 'crocs', 'ugg', 'geox', 'ecco', 'clarks', 'salomon', 'merrell',
].map((b) => b.toLowerCase().replace(/\s+/g, ''));

const CAR_BRAND_FOLDED = CAR_BRANDS.map((b) => foldToken(b));

export function foldToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ё/g, 'е');
}

function parsePriceNumber(
  price: string | number | null | undefined,
  isFree?: boolean | number | string | null
): number | null {
  if (isFree === true || isFree === 1 || isFree === '1') return 0;
  if (price == null) return null;
  const raw = String(price).replace(/[^\d.,]/g, '').replace(',', '.');
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Розмір: 36–48 EU, або явні маркери. */
export function extractSizes(text: string): Set<string> {
  const out = new Set<string>();
  const t = foldToken(text);
  const labeled = [
    ...t.matchAll(/(?:rozmir|размер|size|gr[oö]sse|eu)\s*[:\-]?\s*(\d{2}(?:[.,]\d)?)/gi),
  ];
  for (const m of labeled) out.add(m[1].replace(',', '.'));

  for (const m of t.matchAll(/\b([3-4]\d(?:[.,]5)?)\b/g)) {
    const n = parseFloat(m[1].replace(',', '.'));
    if (n >= 32 && n <= 50) out.add(String(n));
  }
  return out;
}

export function extractBrands(text: string): Set<string> {
  const folded = foldToken(text).replace(/[^a-z0-9а-яіїєґ\s\-]/gi, ' ');
  const compact = folded.replace(/\s+/g, '');
  const found = new Set<string>();

  for (const brand of CAR_BRAND_FOLDED) {
    const re = new RegExp(`(?:^|[^a-z0-9])${brand.replace(/-/g, '[-\\s]?')}(?:[^a-z0-9]|$)`, 'i');
    if (re.test(folded) || compact.includes(brand.replace(/-/g, ''))) {
      found.add(brand.replace(/-/g, ''));
    }
  }
  for (const brand of FASHION_BRANDS) {
    if (compact.includes(brand) || folded.includes(brand)) {
      found.add(brand);
    }
  }
  return found;
}

/** Значущі токени з title (моделі на кшталт x5, 320i, airmax…). */
export function extractSignificantTokens(title: string): string[] {
  const folded = foldToken(title);
  const raw = folded
    .replace(/[^\p{L}\p{N}\+\-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t) && t.length <= 2) continue; // голі «38» як токен моделі не беремо (це розмір)
    tokens.push(t);
  }
  return tokens.slice(0, 12);
}

export type SimilarSignals = {
  brands: Set<string>;
  sizes: Set<string>;
  tokens: string[];
  price: number | null;
  category: string;
  subcategory: string;
};

export function buildSimilarSignals(source: SimilarSource): SimilarSignals {
  const blob = `${source.title}\n${source.description || ''}`;
  return {
    brands: extractBrands(blob),
    sizes: extractSizes(blob),
    tokens: extractSignificantTokens(source.title),
    price: parsePriceNumber(source.price, source.isFree),
    category: (source.category || '').trim(),
    subcategory: (source.subcategory || '').trim(),
  };
}

function setsOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

function tokenHits(tokens: string[], haystack: string): number {
  const h = foldToken(haystack);
  let hits = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (h.includes(t)) hits += 1;
  }
  return hits;
}

/** Чи title містить майже всю «модельну» фразу (2+ токени підряд). */
function modelPhraseBoost(sourceTokens: string[], candidateTitle: string): number {
  if (sourceTokens.length < 2) return 0;
  const h = foldToken(candidateTitle);
  // спробуємо пари/трійки
  for (let len = Math.min(4, sourceTokens.length); len >= 2; len--) {
    for (let i = 0; i <= sourceTokens.length - len; i++) {
      const phrase = sourceTokens.slice(i, i + len).join(' ');
      if (phrase.length >= 4 && h.includes(phrase)) {
        return len * 40;
      }
      // без пробілів: bmwx5 / 320i
      const compact = sourceTokens.slice(i, i + len).join('');
      if (compact.length >= 4 && h.replace(/\s+/g, '').includes(compact)) {
        return len * 35;
      }
    }
  }
  return 0;
}

export function scoreSimilarCandidate(source: SimilarSignals, candidate: SimilarCandidate): number {
  const candBlob = `${candidate.title}\n${candidate.description || ''}`;
  const candBrands = extractBrands(candBlob);
  const candSizes = extractSizes(candBlob);
  const candPrice = parsePriceNumber(candidate.price, candidate.isFree);

  let score = 0;

  const sameSub =
    Boolean(source.subcategory) &&
    Boolean(candidate.subcategory) &&
    foldToken(source.subcategory ?? '') === foldToken(candidate.subcategory ?? '');
  const sameCat =
    Boolean(source.category) &&
    Boolean(candidate.category) &&
    foldToken(source.category ?? '') === foldToken(candidate.category ?? '');
  const subMismatch =
    Boolean(source.subcategory) &&
    Boolean(candidate.subcategory) &&
    !sameSub;

  const brandHits = setsOverlap(source.brands, candBrands);
  // Бренд у чужій підкатегорії (жіночі vs чоловічі) — слабший сигнал
  if (brandHits > 0) score += (subMismatch ? 55 : 120) * brandHits;

  score += modelPhraseBoost(source.tokens, candidate.title);

  const hits = tokenHits(source.tokens, candidate.title);
  // перші токени (часто бренд/модель) важчі
  source.tokens.forEach((t, idx) => {
    if (foldToken(candidate.title).includes(t)) {
      score += Math.max(8, 28 - idx * 3);
    }
  });
  score += hits * 4;

  if (source.sizes.size > 0 && setsOverlap(source.sizes, candSizes) > 0) {
    score += sameSub ? 70 : 40;
  }

  if (sameSub) score += 50;
  else if (sameCat) score += 18;
  if (subMismatch) score -= 35;

  if (source.price != null && candPrice != null && source.price > 0 && candPrice >= 0) {
    const ratio = candPrice / source.price;
    if (ratio >= 0.7 && ratio <= 1.3) score += 35;
    else if (ratio >= 0.5 && ratio <= 1.5) score += 20;
    else if (ratio >= 0.35 && ratio <= 2) score += 8;
  } else if (source.price === 0 && candPrice === 0) {
    score += 15;
  }

  // мінімальний поріг «схожості»: інакше просто рандом з категорії
  return score;
}

export function rankSimilarListings(
  source: SimilarSource,
  candidates: SimilarCandidate[],
  limit = 24
): SimilarCandidate[] {
  const signals = buildSimilarSignals(source);
  const scored = candidates
    .filter((c) => c.id !== source.id)
    .map((c) => ({ c, score: scoreSimilarCandidate(signals, c) }))
    .filter((x) => x.score >= 25) // відсікаємо зовсім чуже
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id);

  // якщо після порогу мало — ослаблюємо до subcategory/category match
  if (scored.length < Math.min(6, limit)) {
    const weak = candidates
      .filter((c) => c.id !== source.id)
      .map((c) => ({ c, score: scoreSimilarCandidate(signals, c) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const seen = new Set(scored.map((s) => s.c.id));
    for (const w of weak) {
      if (seen.has(w.c.id)) continue;
      scored.push(w);
      seen.add(w.c.id);
      if (scored.length >= limit) break;
    }
  }

  return scored.slice(0, limit).map((x) => x.c);
}

/** Пошукові рядки для SQL LIKE (бренд + топ токени). */
export function similarSearchNeedles(source: SimilarSource): string[] {
  const signals = buildSimilarSignals(source);
  const needles: string[] = [];
  for (const b of signals.brands) {
    if (b.length >= 2) needles.push(b);
  }
  for (const t of signals.tokens.slice(0, 4)) {
    if (t.length >= 3 && !needles.includes(t)) needles.push(t);
  }
  return needles.slice(0, 6);
}

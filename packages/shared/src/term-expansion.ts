// Term expansion: turn a free-text user query into a list of canonical
// variants (codes, abbreviations, alternate names) so the AI's WHERE
// filters can match stored values that differ from the user's wording.
//
// Why this exists: the LLM is unreliable at remembering that
// "Germany" should also match "DE" / "DEU" / "Deutschland" or that
// "CA" should also match "California". The most robust fix is to
// compute the expanded list in code and pass it to the model as data
// so it has concrete variants to put into its ILIKE ANY arrays.

const COUNTRY_ALIASES: Record<string, string[]> = {
  // ISO 3166-1 alpha-2 / alpha-3 / common local names.
  // Keys are normalized lowercase; values are the canonical variant set.
  // Multi-word forms ("united states", "south korea") are listed so bigram
  // lookup finds them when the user types two adjacent tokens.
  germany: ['germany', 'german', 'de', 'deu', 'deutschland'],
  de: ['germany', 'german', 'de', 'deu', 'deutschland'],
  deu: ['germany', 'german', 'de', 'deu', 'deutschland'],
  deutschland: ['germany', 'german', 'de', 'deu', 'deutschland'],
  france: ['france', 'french', 'fr', 'fra'],
  fr: ['france', 'french', 'fr', 'fra'],
  fra: ['france', 'french', 'fr', 'fra'],
  'united kingdom': ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  uk: ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  gb: ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  gbr: ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  britain: ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  england: ['united kingdom', 'uk', 'gb', 'gbr', 'britain', 'england', 'great britain'],
  'united states': ['united states', 'usa', 'us', 'united states of america', 'america'],
  usa: ['united states', 'usa', 'us', 'united states of america', 'america'],
  us: ['united states', 'usa', 'us', 'united states of america', 'america'],
  america: ['united states', 'usa', 'us', 'united states of america', 'america'],
  canada: ['canada', 'ca', 'can'],
  ca: ['canada', 'ca', 'can'],
  spain: ['spain', 'es', 'esp', 'españa'],
  es: ['spain', 'es', 'esp', 'españa'],
  italy: ['italy', 'it', 'ita', 'italia'],
  it: ['italy', 'it', 'ita', 'italia'],
  japan: ['japan', 'jp', 'jpn', '日本'],
  jp: ['japan', 'jp', 'jpn', '日本'],
  china: ['china', 'cn', 'chn', '中国'],
  cn: ['china', 'cn', 'chn', '中国'],
  brazil: ['brazil', 'br', 'bra', 'brasil'],
  br: ['brazil', 'br', 'bra', 'brasil'],
  india: ['india', 'in', 'ind'],
  in: ['india', 'in', 'ind'],
  mexico: ['mexico', 'mx', 'mex', 'méxico'],
  mx: ['mexico', 'mx', 'mex', 'méxico'],
  netherlands: ['netherlands', 'nl', 'nld', 'holland'],
  nl: ['netherlands', 'nl', 'nld', 'holland'],
  switzerland: ['switzerland', 'ch', 'che', 'schweiz', 'suisse'],
  ch: ['switzerland', 'ch', 'che', 'schweiz', 'suisse'],
  sweden: ['sweden', 'se', 'swe', 'sverige'],
  se: ['sweden', 'se', 'swe', 'sverige'],
  norway: ['norway', 'no', 'nor', 'norge'],
  no: ['norway', 'no', 'nor', 'norge'],
  denmark: ['denmark', 'dk', 'dnk', 'danmark'],
  dk: ['denmark', 'dk', 'dnk', 'danmark'],
  finland: ['finland', 'fi', 'fin', 'suomi'],
  fi: ['finland', 'fi', 'fin', 'suomi'],
  poland: ['poland', 'pl', 'pol', 'polska'],
  pl: ['poland', 'pl', 'pol', 'polska'],
  portugal: ['portugal', 'pt', 'prt'],
  pt: ['portugal', 'pt', 'prt'],
  russia: ['russia', 'ru', 'rus', 'россия'],
  ru: ['russia', 'ru', 'rus', 'россия'],
  'south korea': ['south korea', 'korea', 'kr', 'kor', '대한민국'],
  korea: ['south korea', 'korea', 'kr', 'kor', '대한민국'],
  kr: ['south korea', 'korea', 'kr', 'kor', '대한민국'],
  australia: ['australia', 'au', 'aus'],
  au: ['australia', 'au', 'aus'],
  'new zealand': ['new zealand', 'nz', 'nzl'],
  nz: ['new zealand', 'nz', 'nzl'],
  ireland: ['ireland', 'ie', 'irl', 'éire'],
  ie: ['ireland', 'ie', 'irl', 'éire'],
  belgium: ['belgium', 'be', 'bel', 'belgië'],
  be: ['belgium', 'be', 'bel', 'belgië'],
  austria: ['austria', 'at', 'aut', 'österreich'],
  at: ['austria', 'at', 'aut', 'österreich'],
  'czech republic': ['czech republic', 'czechia', 'cz', 'cze', 'česko'],
  czechia: ['czech republic', 'czechia', 'cz', 'cze', 'česko'],
  cz: ['czech republic', 'czechia', 'cz', 'cze', 'česko'],
  greece: ['greece', 'gr', 'grc', 'ελλάδα'],
  gr: ['greece', 'gr', 'grc', 'ελλάδα'],
  turkey: ['turkey', 'tr', 'tur', 'türkiye'],
  tr: ['turkey', 'tr', 'tur', 'türkiye'],
  argentina: ['argentina', 'ar', 'arg'],
  ar: ['argentina', 'ar', 'arg'],
  chile: ['chile', 'cl', 'chl'],
  cl: ['chile', 'cl', 'chl'],
  colombia: ['colombia', 'co', 'col'],
  co: ['colombia', 'co', 'col'],
  'south africa': ['south africa', 'za', 'zaf'],
  za: ['south africa', 'za', 'zaf'],
  singapore: ['singapore', 'sg', 'sgp'],
  sg: ['singapore', 'sg', 'sgp'],
  israel: ['israel', 'il', 'isr'],
  il: ['israel', 'il', 'isr'],
  egypt: ['egypt', 'eg', 'egy'],
  eg: ['egypt', 'eg', 'egy'],
  nigeria: ['nigeria', 'ng', 'nga'],
  ng: ['nigeria', 'ng', 'nga'],
};

const US_STATE_ALIASES: Record<string, string> = {
  al: 'alabama',
  ak: 'alaska',
  az: 'arizona',
  ar: 'arkansas',
  ca: 'california',
  co: 'colorado',
  ct: 'connecticut',
  de: 'delaware',
  fl: 'florida',
  ga: 'georgia',
  hi: 'hawaii',
  id: 'idaho',
  il: 'illinois',
  in: 'indiana',
  ia: 'iowa',
  ks: 'kansas',
  ky: 'kentucky',
  la: 'louisiana',
  me: 'maine',
  md: 'maryland',
  ma: 'massachusetts',
  mi: 'michigan',
  mn: 'minnesota',
  ms: 'mississippi',
  mo: 'missouri',
  mt: 'montana',
  ne: 'nebraska',
  nv: 'nevada',
  nh: 'new hampshire',
  nj: 'new jersey',
  nm: 'new mexico',
  ny: 'new york',
  nc: 'north carolina',
  nd: 'north dakota',
  oh: 'ohio',
  ok: 'oklahoma',
  or: 'oregon',
  pa: 'pennsylvania',
  ri: 'rhode island',
  sc: 'south carolina',
  sd: 'south dakota',
  tn: 'tennessee',
  tx: 'texas',
  ut: 'utah',
  vt: 'vermont',
  va: 'virginia',
  wa: 'washington',
  wv: 'west virginia',
  wi: 'wisconsin',
  wy: 'wyoming',
  dc: 'district of columbia',
};

// Watch out: US_STATE_ALIASES and COUNTRY_ALIASES share keys ("de", "ar", "in", "il" etc.).
// When the user types a 2-letter token, we cannot tell country code from US state code
// without context, so we return BOTH expansions and let the SQL OR them.

// Reverse map so a full state name ("california") resolves back to its abbreviation.
const US_STATE_NAME_TO_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_ALIASES).map(([abbr, name]) => [name, abbr]),
);

const CURRENCY_ALIASES: Record<string, string[]> = {
  usd: ['usd', 'us dollar', 'us dollar', 'dollar', '$'],
  dollar: ['usd', 'us dollar', 'dollar', '$'],
  eur: ['eur', 'euro', '€'],
  euro: ['eur', 'euro', '€'],
  gbp: ['gbp', 'pound', 'pound sterling', '£', 'british pound'],
  pound: ['gbp', 'pound', 'pound sterling', '£', 'british pound'],
  jpy: ['jpy', 'yen', '¥', 'japanese yen'],
  yen: ['jpy', 'yen', '¥', 'japanese yen'],
  cny: ['cny', 'rmb', 'yuan', '¥', 'chinese yuan'],
  yuan: ['cny', 'rmb', 'yuan', '¥', 'chinese yuan'],
  inr: ['inr', 'rupee', 'indian rupee', '₹'],
  rupee: ['inr', 'rupee', 'indian rupee', '₹'],
  brl: ['brl', 'real', 'brazilian real', 'r$'],
  real: ['brl', 'real', 'brazilian real', 'r$'],
  cad: ['cad', 'canadian dollar', 'c$'],
  aud: ['aud', 'australian dollar', 'a$'],
  chf: ['chf', 'swiss franc'],
};

const LANGUAGE_ALIASES: Record<string, string[]> = {
  english: ['english', 'en', 'eng'],
  en: ['english', 'en', 'eng'],
  spanish: ['spanish', 'es', 'spa', 'español'],
  es: ['spanish', 'es', 'spa', 'español'],
  french: ['french', 'fr', 'fra', 'français'],
  fr: ['french', 'fr', 'fra', 'français'],
  german: ['german', 'de', 'deu', 'deutsch'],
  de: ['german', 'de', 'deu', 'deutsch'],
  italian: ['italian', 'it', 'ita', 'italiano'],
  it: ['italian', 'it', 'ita', 'italiano'],
  portuguese: ['portuguese', 'pt', 'por', 'português'],
  pt: ['portuguese', 'pt', 'por', 'português'],
  japanese: ['japanese', 'ja', 'jpn', '日本語'],
  ja: ['japanese', 'ja', 'jpn', '日本語'],
  chinese: ['chinese', 'zh', 'zho', '中文'],
  zh: ['chinese', 'zh', 'zho', '中文'],
  korean: ['korean', 'ko', 'kor', '한국어'],
  ko: ['korean', 'ko', 'kor', '한국어'],
  russian: ['russian', 'ru', 'rus', 'русский'],
  ru: ['russian', 'ru', 'rus', 'русский'],
  arabic: ['arabic', 'ar', 'ara', 'العربية'],
  ar: ['arabic', 'ar', 'ara', 'العربية'],
};

// Common street-type abbreviations. These fire when the token is 1-3 chars
// in title-case / uppercase and matches a known abbrev.
const STREET_ABBREVIATIONS: Record<string, string[]> = {
  st: ['street', 'st'],
  street: ['street', 'st'],
  ave: ['avenue', 'ave'],
  avenue: ['avenue', 'ave'],
  blvd: ['boulevard', 'blvd'],
  boulevard: ['boulevard', 'blvd'],
  rd: ['road', 'rd'],
  road: ['road', 'rd'],
  dr: ['drive', 'dr'],
  drive: ['drive', 'dr'],
  ln: ['lane', 'ln'],
  lane: ['lane', 'ln'],
  ct: ['court', 'ct'],
  court: ['court', 'ct'],
  pl: ['place', 'pl'],
  place: ['place', 'pl'],
  sq: ['square', 'sq'],
  square: ['square', 'sq'],
  hwy: ['highway', 'hwy'],
  highway: ['highway', 'hwy'],
  pkw: ['parkway', 'pkw', 'pkwy'],
  parkway: ['parkway', 'pkw', 'pkwy'],
  mt: ['mount', 'mountain', 'mt'],
  mount: ['mount', 'mountain', 'mt'],
  ft: ['fort', 'ft'],
  fort: ['fort', 'ft'],
  pt: ['point', 'pt'],
  point: ['point', 'pt'],
  is: ['island', 'is'],
  island: ['island', 'is'],
};

const GENDER_ALIASES: Record<string, string[]> = {
  male: ['male', 'm', 'man'],
  m: ['male', 'm', 'man'],
  female: ['female', 'f', 'woman'],
  f: ['female', 'f', 'woman'],
  nonbinary: ['nonbinary', 'non-binary', 'nb', 'enby'],
};

const BOOLEAN_ALIASES: Record<string, string[]> = {
  yes: ['yes', 'y', 'true', '1', 't'],
  no: ['no', 'n', 'false', '0', 'f'],
  true: ['yes', 'y', 'true', '1', 't'],
  false: ['no', 'n', 'false', '0', 'f'],
  active: ['active', 'enabled', 'true', 'yes', '1'],
  inactive: ['inactive', 'disabled', 'false', 'no', '0'],
};

// Maps a normalized lower-case term to the set of variants that should also
// be checked. Variant lists are pre-baked; this function picks the right
// table based on the term length and shape.
function lookup(term: string): string[] | null {
  const lower = term.toLowerCase().trim();
  if (!lower) return null;

  // 2-letter uppercase: ambiguous between country code and US state code.
  // Return both expansions and let SQL OR them.
  if (lower.length === 2) {
    const out = new Set<string>([lower, lower.toUpperCase()]);
    let hit = false;
    if (COUNTRY_ALIASES[lower]) {
      COUNTRY_ALIASES[lower].forEach((v) => out.add(v.toLowerCase()));
      hit = true;
    }
    if (US_STATE_ALIASES[lower]) {
      out.add(US_STATE_ALIASES[lower]);
      hit = true;
    }
    if (CURRENCY_ALIASES[lower]) {
      CURRENCY_ALIASES[lower].forEach((v) => out.add(v.toLowerCase()));
      hit = true;
    }
    if (LANGUAGE_ALIASES[lower]) {
      LANGUAGE_ALIASES[lower].forEach((v) => out.add(v.toLowerCase()));
      hit = true;
    }
    if (GENDER_ALIASES[lower]) {
      GENDER_ALIASES[lower].forEach((v) => out.add(v.toLowerCase()));
      hit = true;
    }
    if (BOOLEAN_ALIASES[lower]) {
      BOOLEAN_ALIASES[lower].forEach((v) => out.add(v.toLowerCase()));
      hit = true;
    }
    return hit ? Array.from(out) : null;
  }

  // 3-letter ISO-style codes (countries alpha-3, currency, language alpha-3).
  if (lower.length === 3) {
    if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
    if (CURRENCY_ALIASES[lower]) return CURRENCY_ALIASES[lower];
    if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
    // street abbrev (ave, blvd, etc.) handled below.
  }

  // Full names.
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  if (CURRENCY_ALIASES[lower]) return CURRENCY_ALIASES[lower];
  if (LANGUAGE_ALIASES[lower]) return LANGUAGE_ALIASES[lower];
  if (GENDER_ALIASES[lower]) return GENDER_ALIASES[lower];
  if (BOOLEAN_ALIASES[lower]) return BOOLEAN_ALIASES[lower];
  // US state: only Record<string, string> map, so build reverse lookup at module level
  // and return both the full name and abbreviation as canonical variants.
  const stateAbbr = US_STATE_NAME_TO_ABBR[lower];
  if (stateAbbr) return [lower, stateAbbr];

  // 1-3 char abbrevs.
  if (STREET_ABBREVIATIONS[lower]) return STREET_ABBREVIATIONS[lower];

  return null;
}

// Split user text into "candidate terms" — tokens that are at least 2
// characters, plus bigrams of adjacent tokens (so "new york" and "new
// mexico" both surface even when joined as "new").
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'will',
  'with',
  'who',
  'what',
  'when',
  'where',
  'which',
  'why',
  'how',
  'do',
  'does',
  'did',
  'show',
  'find',
  'list',
  'get',
  'all',
  'any',
  'some',
  'my',
  'me',
  'i',
  'you',
  'your',
  'we',
  'us',
  'our',
  'they',
  'them',
  'their',
  'tell',
  'give',
  'many',
  'much',
  'count',
  'number',
  'please',
  'can',
  'could',
  'would',
  'should',
  'may',
  'might',
  'about',
  'than',
  'then',
  'there',
  'here',
  'also',
  'just',
  'only',
  'into',
  'over',
  'under',
  'between',
  'through',
  'before',
  'after',
  'since',
  'because',
  'if',
  'else',
]);

function tokenize(text: string): string[] {
  // Split on whitespace + punctuation, keep tokens of length >= 2.
  return text
    .toLowerCase()
    .split(/[^a-z0-9À-ɏ]+/i)
    .filter((t) => t.length >= 2);
}

export type TermExpansion = {
  /** The original term detected in user text. */
  term: string;
  /** Variants the SQL should match. */
  variants: string[];
};

/**
 * Scan the user message and return any term expansions that apply.
 * Returns an array of { term, variants } entries — at most one per
 * detected term. An empty array means no expansion was found.
 */
export function expandTerms(userText: string): TermExpansion[] {
  const tokens = tokenize(userText);
  const out: TermExpansion[] = [];
  const seen = new Set<string>();

  // Single tokens.
  for (const tok of tokens) {
    if (seen.has(tok)) continue;
    const variants = lookup(tok);
    // Skip stop words only when no expansion is found — otherwise "us"/"in"/"me"
    // would be filtered out before the country/state lookup runs.
    if (!variants && STOP_WORDS.has(tok)) continue;
    if (variants) {
      seen.add(tok);
      out.push({ term: tok, variants });
    }
  }

  // Adjacent bigrams, e.g. "new york", "new mexico", "united states",
  // "great britain", "south korea". These surface multi-word terms.
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
    const bigram = `${a} ${b}`;
    const variants = lookup(bigram);
    if (variants) {
      const key = bigram;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ term: bigram, variants });
      }
    }
  }

  return out;
}

/**
 * Render expansions as a compact block suitable for appending to a
 * system prompt. Each line is `term -> variant1, variant2, ...` so the
 * model has the canonical list to put into its ILIKE ANY array.
 */
export function renderExpansionsForPrompt(expansions: TermExpansion[]): string {
  if (expansions.length === 0) return '';
  const lines = expansions.map((e) => `- "${e.term}" -> ${e.variants.map((v) => `"${v}"`).join(', ')}`);
  return `Term expansions for the user's query (use these variants verbatim in WHERE filters):\n${lines.join('\n')}`;
}

/**
 * Spoken-number → digit normalisation.
 *
 * Deepgram (`multi`) and the LLM sometimes render numbers as words — Hindi and
 * Hinglish turns especially ("नौ आठ सात…", "nine eight seven six five",
 * "two thousand four hundred ninety nine"). Customers expect phone numbers,
 * PIN codes, flat numbers, order codes and amounts to *look* like numbers in
 * the transcript and in chat, so every spoken number is converted to digits:
 *
 *   "my number is nine eight seven six five four three two one zero"
 *     → "my number is 9876543210"
 *   "order N M one zero zero two three"       → "order N M 10023"
 *   "total two thousand four hundred ninety nine rupees" → "total 2,499 rupees"
 *   "flat twelve B, pin one one zero zero two four"       → "flat 12 B, pin 110024"
 *
 * Rules that keep natural language intact:
 *   - A *run* of number words (≥2 adjacent tokens) is always converted:
 *     digit-by-digit runs concatenate ("nine eight seven" → "987"), runs with
 *     tens/scales parse as one cardinal ("forty two" → "42", "two thousand"
 *     → "2,000").
 *   - A single English word ≥10 ("twelve") and any single Devanagari number
 *     word ("दो") convert on their own — they are unambiguously numeric.
 *   - A single low English digit word ("four") converts only next to a number
 *     context ("flat four" → "flat 4", "four items" → "4 items").
 *   - A single romanised Hindi word ("do", "ek", "teen") NEVER converts alone
 *     — "kar do" must stay "kar do" — only inside a run ("ek do teen" → "1 2 3").
 */

type TokenKind = 'unit' | 'ten' | 'scale' | 'repeat';

interface NumberWord {
  kind: TokenKind;
  /** unit/ten: the value; scale: the multiplier; repeat: how many times. */
  value: number;
  /** Romanised Hindi words only convert inside a run, never standalone. */
  roman?: boolean;
  /** Devanagari words always convert, even standalone. */
  deva?: boolean;
}

function words(
  entries: Array<[string, number, TokenKind?, Partial<NumberWord>?]>,
  defaults: Partial<NumberWord> = {},
): void {
  for (const [word, value, kind = 'unit', extra] of entries) {
    VOCAB[word] = { kind, value, ...defaults, ...extra };
  }
}

const VOCAB: Record<string, NumberWord> = {};

// --- English ---------------------------------------------------------------
words([
  ['zero', 0], ['oh', 0], ['one', 1], ['two', 2], ['three', 3], ['four', 4],
  ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9],
]);
words([
  ['ten', 10, 'ten'], ['eleven', 11, 'ten'], ['twelve', 12, 'ten'], ['thirteen', 13, 'ten'],
  ['fourteen', 14, 'ten'], ['fifteen', 15, 'ten'], ['sixteen', 16, 'ten'], ['seventeen', 17, 'ten'],
  ['eighteen', 18, 'ten'], ['nineteen', 19, 'ten'], ['twenty', 20, 'ten'], ['thirty', 30, 'ten'],
  ['forty', 40, 'ten'], ['fourty', 40, 'ten'], ['fifty', 50, 'ten'], ['sixty', 60, 'ten'],
  ['seventy', 70, 'ten'], ['eighty', 80, 'ten'], ['ninety', 90, 'ten'],
]);
words([
  ['hundred', 100, 'scale'], ['thousand', 1000, 'scale'],
  ['lakh', 100000, 'scale'], ['lac', 100000, 'scale'], ['lakhs', 100000, 'scale'],
  ['million', 1000000, 'scale'], ['crore', 10000000, 'scale'], ['crores', 10000000, 'scale'],
]);
words([['double', 2, 'repeat'], ['triple', 3, 'repeat']]);

// --- Hindi (Devanagari) — unambiguous, converts even standalone ------------
words([
  ['शून्य', 0], ['एक', 1], ['दो', 2], ['तीन', 3], ['चार', 4],
  ['पाँच', 5], ['पांच', 5], ['छह', 6], ['छः', 6], ['सात', 7], ['आठ', 8], ['नौ', 9],
], { deva: true });
words([
  ['दस', 10, 'ten'], ['ग्यारह', 11, 'ten'], ['बारह', 12, 'ten'], ['तेरह', 13, 'ten'],
  ['चौदह', 14, 'ten'], ['पंद्रह', 15, 'ten'], ['सोलह', 16, 'ten'], ['सत्रह', 17, 'ten'],
  ['अठारह', 18, 'ten'], ['उन्नीस', 19, 'ten'], ['उननीस', 19, 'ten'], ['बीस', 20, 'ten'],
  ['इक्कीस', 21, 'ten'], ['बाईस', 22, 'ten'], ['तेईस', 23, 'ten'], ['चौबीस', 24, 'ten'],
  ['पच्चीस', 25, 'ten'], ['छब्बीस', 26, 'ten'], ['सत्ताईस', 27, 'ten'], ['अट्ठाईस', 28, 'ten'],
  ['उनतीस', 29, 'ten'], ['तीस', 30, 'ten'], ['इकतीस', 31, 'ten'], ['बत्तीस', 32, 'ten'],
  ['तैंतीस', 33, 'ten'], ['चौंतीस', 34, 'ten'], ['पैंतीस', 35, 'ten'], ['छत्तीस', 36, 'ten'],
  ['सैंतीस', 37, 'ten'], ['अड़तीस', 38, 'ten'], ['उनतालीस', 39, 'ten'], ['चालीस', 40, 'ten'],
  ['इकतालीस', 41, 'ten'], ['बयालीस', 42, 'ten'], ['तैतालीस', 43, 'ten'], ['चवालीस', 44, 'ten'],
  ['पैंतालीस', 45, 'ten'], ['छियालीस', 46, 'ten'], ['सैंतालीस', 47, 'ten'], ['अड़तालीस', 48, 'ten'],
  ['उनचास', 49, 'ten'], ['पचास', 50, 'ten'], ['इक्यावन', 51, 'ten'], ['बावन', 52, 'ten'],
  ['तिरेपन', 53, 'ten'], ['चौवन', 54, 'ten'], ['पचपन', 55, 'ten'], ['छप्पन', 56, 'ten'],
  ['सत्तावन', 57, 'ten'], ['अट्ठावन', 58, 'ten'], ['उनसठ', 59, 'ten'], ['साठ', 60, 'ten'],
  ['इकसठ', 61, 'ten'], ['बासठ', 62, 'ten'], ['तिरेसठ', 63, 'ten'], ['चौसठ', 64, 'ten'],
  ['पैंसठ', 65, 'ten'], ['छियासठ', 66, 'ten'], ['सड़सठ', 67, 'ten'], ['अड़सठ', 68, 'ten'],
  ['उनहत्तर', 69, 'ten'], ['सत्तर', 70, 'ten'], ['इकहत्तर', 71, 'ten'], ['बहत्तर', 72, 'ten'],
  ['तिहत्तर', 73, 'ten'], ['चौहत्तर', 74, 'ten'], ['पचहत्तर', 75, 'ten'], ['छिहत्तर', 76, 'ten'],
  ['सतहत्तर', 77, 'ten'], ['अठहत्तर', 78, 'ten'], ['उनयासी', 79, 'ten'], ['अस्सी', 80, 'ten'],
  ['इक्यासी', 81, 'ten'], ['बयासी', 82, 'ten'], ['तिरासी', 83, 'ten'], ['चौरासी', 84, 'ten'],
  ['पचासी', 85, 'ten'], ['छियासी', 86, 'ten'], ['सत्तासी', 87, 'ten'], ['अट्ठासी', 88, 'ten'],
  ['नवासी', 89, 'ten'], ['नब्बे', 90, 'ten'], ['इक्यानवे', 91, 'ten'], ['बानवे', 92, 'ten'],
  ['तिरानवे', 93, 'ten'], ['चौरानवे', 94, 'ten'], ['पंचानवे', 95, 'ten'], ['छियानवे', 96, 'ten'],
  ['सत्तानवे', 97, 'ten'], ['अट्ठानवे', 98, 'ten'], ['निन्यानवे', 99, 'ten'],
], { deva: true });
words([
  ['सौ', 100, 'scale'], ['हज़ार', 1000, 'scale'], ['हजार', 1000, 'scale'],
  ['लाख', 100000, 'scale'], ['करोड़', 10000000, 'scale'],
], { deva: true });
words([['डबल', 2, 'repeat', { deva: true }]]);

// --- Romanised Hindi (Hinglish) — run-only, "kar do" must survive ----------
words([
  ['ek', 1], ['do', 2], ['teen', 3], ['chaar', 4], ['char', 4],
  ['paanch', 5], ['panch', 5], ['chhah', 6], ['cheh', 6], ['saat', 7],
  ['aath', 8], ['nau', 9], ['shoonya', 0],
].map(([w, v]) => [w, v, 'unit' as TokenKind, { roman: true }] as [string, number, TokenKind, Partial<NumberWord>]));
words([
  ['das', 10], ['dass', 10], ['gyarah', 11], ['barah', 12], ['terah', 13],
  ['chaudah', 14], ['pandrah', 15], ['solah', 16], ['satrah', 17], ['atharah', 18],
  ['unnees', 19], ['bees', 20], ['ikkis', 21], ['teis', 23], ['tees', 30],
  ['chalis', 40], ['pachaas', 50], ['pachas', 50], ['sattar', 70], ['assi', 80], ['nabbe', 90],
].map(([w, v]) => [w, v, 'ten' as TokenKind, { roman: true }] as [string, number, TokenKind, Partial<NumberWord>]));
words([
  ['sau', 100, 'scale', { roman: true }], ['hazaar', 1000, 'scale', { roman: true }],
  ['hazar', 1000, 'scale', { roman: true }],
]);

/** Words that make a lone low digit numeric: "flat four", "4 items", "₹ five". */
const CONTEXT_WORDS = new Set([
  'number', 'no', 'phone', 'mobile', 'contact', 'pin', 'pincode', 'zip', 'code',
  'flat', 'house', 'building', 'floor', 'address', 'sector', 'block', 'lane',
  '₹', 'rs', 'rupee', 'rupees', 'rupay', 'rupaye', 'paisa', 'paise',
  'qty', 'quantity', 'pcs', 'pc', 'piece', 'pieces', 'item', 'items', 'units',
  'order', 'total', 'amount', 'price', 'cost', 'worth', 'digit', 'digits',
  'kg', 'gram', 'grams', 'g', 'km', 'ml', 'l', 'litre', 'liter', 'percent',
  'नंबर', 'फोन', 'पिन', 'कोड', 'पता', 'रुपये', 'रुपया', 'मात्रा', 'संख्या', 'कुल', 'कीमत', 'मंजिल', 'फ्लैट',
]);

const DEVANAGARI_DIGITS = /[०-९]/g;

/**
 * Devanagari verbs after which "दो" means *give*, not *two* ("दे दो", "कर दो").
 * A lone low Devanagari digit right after one of these stays a word.
 */
const DEVA_VERB_GUARDS = new Set([
  'दे', 'कर', 'बोल', 'लिख', 'दिखा', 'बता', 'रख', 'उठा', 'भेज', 'ला', 'ले', 'मिल', 'पकड़', 'चख',
]);

/** ०-९ → 0-9 (Devanagari digits render as ASCII everywhere in the UI). */
export function normalizeDevanagariDigits(text: string): string {
  return text.replace(DEVANAGARI_DIGITS, (ch) => String(ch.charCodeAt(0) - 0x0966));
}

interface Token {
  raw: string;
  /** Without surrounding punctuation, lowercased — the vocabulary key. */
  core: string;
  start: number;
  end: number;
  lead: string;
  trail: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const raw = match[0];
    // \p{M} (combining marks) must belong to the word: Devanagari matras
    // ("दो" = द + ो) are marks, and splitting them off breaks the vocab lookup.
    const m = raw.match(/^([^\p{L}\p{N}\p{M}]*)([\p{L}\p{N}\p{M}]+)([^\p{L}\p{N}\p{M}]*)$/u);
    const core = (m ? m[2] : raw).toLowerCase();
    tokens.push({
      raw,
      core,
      start: match.index!,
      end: match.index! + raw.length,
      lead: m ? m[1] : '',
      trail: m ? m[3] : '',
    });
  }
  return tokens;
}

/** Cardinal parse of a run that contains tens/scales: "two thousand four hundred ninety nine" → 2499. */
function parseCardinal(run: NumberWord[]): number {
  let total = 0;
  let current = 0;
  for (const token of run) {
    if (token.kind === 'scale') {
      const base = current === 0 ? 1 : current;
      if (token.value === 100) {
        current = base * 100;
      } else {
        total += base * token.value;
        current = 0;
      }
    } else {
      current += token.value;
    }
  }
  return total + current;
}

function formatCardinal(value: number): string {
  return value >= 1000 ? value.toLocaleString('en-IN') : String(value);
}

/** Expands "double five" / "triple two" into repeated digit tokens. */
function expandRepeats(tokens: Token[]): { words: NumberWord[]; hadRepeat: boolean } {
  const words: NumberWord[] = [];
  let hadRepeat = false;
  for (let i = 0; i < tokens.length; i++) {
    const word = VOCAB[tokens[i].core];
    if (word.kind === 'repeat') {
      const next = tokens[i + 1] ? VOCAB[tokens[i + 1].core] : undefined;
      if (next && next.kind === 'unit') {
        hadRepeat = true;
        for (let n = 0; n < word.value; n++) words.push(next);
        i++;
        continue;
      }
      continue; // a dangling "double" carries no number — drop it from the parse
    }
    words.push(word);
  }
  return { words, hadRepeat };
}

function hasContextNearby(tokens: Token[], index: number): boolean {
  for (let i = Math.max(0, index - 2); i <= Math.min(tokens.length - 1, index + 2); i++) {
    if (i === index) continue;
    if (CONTEXT_WORDS.has(tokens[i].core)) return true;
    // "₹500" / "NM-10023" style glued symbols count as context too.
    if (/[₹]/.test(tokens[i].raw)) return true;
  }
  return false;
}

function convertRun(tokens: Token[], run: number[], all: Token[]): string | null {
  const { words, hadRepeat } = expandRepeats(tokens);
  if (words.length === 0) return null;
  const vocab = run.map((i) => VOCAB[all[i].core]);
  const hasScaleOrTen = vocab.some((w) => w.kind === 'scale' || w.kind === 'ten');

  if (run.length === 1) {
    const word = vocab[0];
    const index = run[0];
    if (word.roman) return null; // "kar do", "ek minute" — never touch a lone romanised word
    if (word.deva) {
      // Devanagari words are numeric, except "दो" (= give) right after a verb.
      if (word.kind === 'unit' && index > 0 && DEVA_VERB_GUARDS.has(all[index - 1].core)) {
        return null;
      }
      return String(word.value);
    }
    if (word.kind === 'repeat') return null;
    if (word.kind === 'ten') return String(word.value); // twelve → 12, twenty → 20
    if (word.kind === 'scale') return hasContextNearby(all, index) ? formatCardinal(word.value) : null;
    return hasContextNearby(all, index) ? String(word.value) : null; // lone "four" needs context
  }

  if (hasScaleOrTen || hadRepeat) {
    if (hadRepeat && !hasScaleOrTen) {
      // "double five double one" → digit string, not a cardinal sum
      return words.filter((w) => w.kind === 'unit').map((w) => w.value).join('');
    }
    return formatCardinal(parseCardinal(words));
  }

  // All plain units: a spoken digit string ("nine eight seven…").
  const digits = words.map((w) => String(w.value));
  return digits.length >= 3 ? digits.join('') : digits.join(' ');
}

/**
 * Converts spoken numbers (English, Hindi, Hinglish) in `text` to digits.
 * Pure and idempotent — text already written in digits is returned unchanged.
 */
export function spokenNumbersToDigits(text: string): string {
  if (!text) return text;
  const withDigits = normalizeDevanagariDigits(text);
  const tokens = tokenize(withDigits);
  if (tokens.length === 0) return withDigits;

  // Maximal runs of adjacent number-word tokens.
  const runs: number[][] = [];
  let current: number[] = [];
  tokens.forEach((token, i) => {
    if (VOCAB[token.core]) {
      current.push(i);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length) runs.push(current);
  if (runs.length === 0) return withDigits;

  let out = '';
  let cursor = 0;
  for (const run of runs) {
    const first = tokens[run[0]];
    const last = tokens[run[run.length - 1]];
    const replacement = convertRun(
      run.map((i) => tokens[i]),
      run,
      tokens,
    );
    out += withDigits.slice(cursor, first.start);
    if (replacement === null) {
      out += withDigits.slice(first.start, last.end);
    } else {
      out += `${first.lead}${replacement}${last.trail}`;
    }
    cursor = last.end;
  }
  out += withDigits.slice(cursor);
  return out;
}

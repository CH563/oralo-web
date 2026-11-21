import { ranges, emojiPattern, UNICODE_VERSION } from './unicode-data.js';
export { UNICODE_VERSION };
export const MAX_CODE_POINTS = 20000;
const emoji = new RegExp(emojiPattern, 'uy');
const words = /(?:[A-Z]\.)+[A-Z]\.?(?![A-Za-z])|[A-Za-z]+(?:['-][A-Za-z]+)*/y;
const blockedSymbols = new Set(['%', '‰', '‱', '&', '@', '#', '/', '\\']);
const errorOrder = ['numbers', 'symbols', 'text', 'hidden'];
function includes(table, point) {
  let low = 0, high = table.length / 2 - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (point < table[middle * 2]) high = middle - 1;
    else if (point > table[middle * 2 + 1]) low = middle + 1;
    else return true;
  }
  return false;
}
export function countScript(original) {
  let length = 0, unassigned = false;
  for (const char of original) {
    if (++length > MAX_CODE_POINTS) return { errors: ['tooLong'] };
    if (includes(ranges.unassigned, char.codePointAt(0))) unassigned = true;
  }
  // NFC is canonical normalization, not compatibility folding. The original stays untouched.
  const text = original.replace(/\r\n?/g, '\n').normalize('NFC').replace(/\u2019/g, "'").replace(/[\u2010\u2011]/g, '-');
  // A newer browser's NFC must not turn a character outside the pinned repertoire into supported text.
  const errors = new Set(unassigned ? ['hidden'] : []);
  let H = 0, E = 0;
  for (let index = 0; index < text.length;) {
    emoji.lastIndex = index;
    const sequence = emoji.exec(text);
    if (sequence) { errors.add('symbols'); index += sequence[0].length; continue; }
    const point = text.codePointAt(index);
    const char = String.fromCodePoint(point);
    const han = includes(ranges.han, point);
    if (!han && includes(ranges.numbers, point)) errors.add('numbers');
    else if (blockedSymbols.has(char) || includes(ranges.symbols, point)) errors.add('symbols');
    else if (char === '\n' || char === '\t' || includes(ranges.spaces, point)) { /* allowed spacing */ }
    else if (includes(ranges.hidden, point)) errors.add('hidden');
    else if (han) H++;
    else if (/[A-Za-z]/.test(char)) {
      words.lastIndex = index;
      const word = words.exec(text);
      E++; index += word[0].length; continue;
    } else if (!includes(ranges.punctuation, point)) errors.add('text');
    index += char.length;
  }
  // No partial totals escape when any part of the script is unsupported.
  if (errors.size) return { errors: errorOrder.filter(key => errors.has(key)) };
  if (H + E === 0) return { errors: ['empty'] };
  return { H, E, errors: [] };
}
function integer(value, min, max) {
  const trimmed = String(value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function minutesInTenths(value) {
  const trimmed = String(value ?? '').trim();
  if (!/^\d+(?:\.\d)?$/.test(trimmed)) return null;
  const [whole, fraction = '0'] = trimmed.split('.');
  const tenths = Number(whole) * 10 + Number(fraction);
  return Number.isSafeInteger(tenths) && tenths >= 1 && tenths <= 1800 ? tenths : null;
}
export function estimateTime({ script = '', Rc, Re, P }) {
  const counts = countScript(script);
  const errors = {};
  if (counts.errors.length) errors.script = counts.errors;
  const allowance = integer(P, 0, 3600);
  if (allowance === null) errors.P = ['P'];
  // An unused pace must not invalidate a monolingual script.
  const chinese = counts.H ? integer(Rc, 50, 600) : 1;
  const english = counts.E ? integer(Re, 50, 400) : 1;
  if (chinese === null) errors.Rc = ['Rc'];
  if (english === null) errors.Re = ['Re'];
  if (Object.keys(errors).length) return { errors };
  const { H, E } = counts;
  const denominator = chinese * english;
  const numerator = 60 * H * english + 60 * E * chinese + allowance * denominator;
  // All operands are bounded integers: exact half-up rounding, once after summing.
  const seconds = Math.max(1, Math.floor((2 * numerator + denominator) / (2 * denominator)));
  return { H, E, seconds, minutes: Math.floor(seconds / 60), remainder: seconds % 60,
    Rc: H ? chinese : null, Re: E ? english : null, P: allowance };
}
export function estimateBudget({ language, M, Rc, Re, P }) {
  const errors = {};
  if (language !== 'zh' && language !== 'en') errors.language = ['language'];
  const tenths = minutesInTenths(M);
  const allowance = integer(P, 0, 3600);
  const rateKey = language === 'zh' ? 'Rc' : 'Re';
  const rate = integer(language === 'zh' ? Rc : Re, 50, language === 'zh' ? 600 : 400);
  if (tenths === null) errors.M = ['M'];
  if (allowance === null) errors.P = ['P'];
  if (rate === null) errors[rateKey] = [rateKey];
  if (Object.keys(errors).length) return { errors };
  const available = tenths * 6 - allowance;
  if (available <= 0) return { errors: { P: ['allowanceTooLarge'] } };
  const budget = Math.floor(available * rate / 60);
  if (budget === 0) return { errors: { M: ['zeroBudget'] } };
  return { language, M: tenths / 10, P: allowance, rate, budget };
}

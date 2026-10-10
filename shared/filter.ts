/**
 * Content filter for coin name / ticker / description, run in the browser (instant feedback)
 * and again on the server at upload + build (authoritative). Deterministic, no network.
 *
 * Memecoins are crude by nature, so ordinary profanity is allowed. What is blocked:
 * slurs, hate symbols, sexual content involving minors, self-harm incitement and
 * scam / phishing wording. Matching tolerates leetspeak, repeated letters and separators
 * ("n.i.g", "f4gg0t") while keeping Scunthorpe-style false positives out
 * (snigger, Niger, spice, raccoon, cocoon).
 */

export interface FilterResult {
  ok: boolean;
  reasons: string[];
}

const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '9': 'g', '6': 'g', '8': 'b', '+': 't',
};

export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .replace(/[​-‏⁠﻿]/g, '') // zero-width
    .toLowerCase()
    .replace(/(^|[^a-z0-9])\$(?=[a-z0-9])/g, '$1 ') // "$TICKER" prefix is not an "s"
    .replace(/[0-9!|@$+]/g, (c) => LEET[c] ?? c);
}

const SEP = '[^a-z0-9]*';
/**
 * word → regex tolerant of repeats and separators. `end` also requires a word end
 * (plural ok, or the given suffix alternation, e.g. 'ed|s').
 */
function fuzzy(word: string, end: boolean | string = false): RegExp {
  const body = [...word].map((c) => `${c}+`).join(SEP);
  const tail = end === false ? '' : `(?:${end === true ? 'e?s|z' : end})?(?![a-z])`;
  return new RegExp(`(?<![a-z])${body}${tail}`, 'i');
}

const SLURS: RegExp[] = [
  fuzzy('nigger'),
  fuzzy('nigga'),
  fuzzy('niglet'),
  fuzzy('faggot'),
  fuzzy('fag', true),
  fuzzy('retard', 'ed|s|z|io|o'),
  fuzzy('tranny'),
  fuzzy('kike', true),
  fuzzy('spic', true),
  fuzzy('chink', true),
  fuzzy('gook', true),
  fuzzy('coon', true),
  fuzzy('wetback'),
  fuzzy('beaner'),
  fuzzy('towelhead'),
  fuzzy('raghead'),
  fuzzy('sandnigger'),
  fuzzy('dyke', true),
  fuzzy('shemale'),
  /\bporch\s*monkey/i,
  /\bjungle\s*bunny/i,
];

const HATE: RegExp[] = [
  fuzzy('hitler'),
  fuzzy('heil', true),
  fuzzy('nazi'),
  fuzzy('kkk', true),
  /(?<![0-9])14\s*[/\\|-]?\s*88(?![0-9])/,
  /\bwhite\s*power\b/i,
  /\bgas\s*the\s*\w+/i,
  /\bholocaust\b/i,
  /\bgenocide\b/i,
];

const MINORS: RegExp[] = [
  fuzzy('loli', true),
  fuzzy('lolicon'),
  fuzzy('shota', true),
  fuzzy('pedo'),
  fuzzy('paedo'),
  /\bchild\s*(porn|sex|abuse)/i,
  /\bunder\s*age\s*(sex|nudes?|porn)/i,
  /\bcp\s*(link|vids?|videos?|pics?)\b/i,
];

const SELF_HARM: RegExp[] = [/(?<![a-z])kys(?![a-z])/i, /\bkill\s*your\s*self\b/i, /\bkill\s*yourselves\b/i];

const SCAM: RegExp[] = [
  /\b(seed|secret|recovery)\s*phrase\b/i,
  /\bprivate\s*keys?\b/i,
  /\bconnect\s+(your\s+)?wallet\s+to\s+(claim|verify|receive)/i,
  /\b(verify|validate|sync)\s+(your\s+)?wallet\b/i,
  /\bclaim\s+(your\s+)?(free\s+)?(airdrop|tokens?|rewards?|sol)\b/i,
  /\bsend\s+\d+(\.\d+)?\s*sol\s+(and|to)\s+(get|receive)/i,
  /\bdouble\s+your\s+sol\b/i,
];

const CHECKS: [string, RegExp[]][] = [
  ['slur', SLURS],
  ['hate symbol or slogan', HATE],
  ['sexual content involving minors', MINORS],
  ['self-harm incitement', SELF_HARM],
  ['scam / phishing wording', SCAM],
];

export function checkText(input: string): FilterResult {
  if (!input) return { ok: true, reasons: [] };
  const raw = input.toLowerCase();
  const norm = normalize(input);
  const reasons: string[] = [];
  for (const [label, rules] of CHECKS) {
    if (rules.some((r) => r.test(norm) || r.test(raw))) reasons.push(label);
  }
  return { ok: reasons.length === 0, reasons };
}

/** Checks each launch field; returns per-field reasons for anything blocked. */
export function checkLaunchFields(f: { name?: string; ticker?: string; description?: string }): { ok: boolean; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  for (const k of ['name', 'ticker', 'description'] as const) {
    const r = checkText(f[k] ?? '');
    if (!r.ok) fields[k] = r.reasons;
  }
  // a slur split across name + ticker
  const joined = checkText(`${f.name ?? ''}${f.ticker ?? ''}`);
  if (!joined.ok && !fields.name && !fields.ticker) fields.name = joined.reasons;
  return { ok: Object.keys(fields).length === 0, fields };
}

export function filterMessage(fields: Record<string, string[]>): string {
  return Object.entries(fields)
    .map(([k, r]) => `${k}: blocked (${r.join(', ')})`)
    .join('; ');
}

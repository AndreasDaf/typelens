// constants.js
// -----------------------------------------------------------------------------
// Shared, dependency-free constants and pure helper functions used by the
// service worker, popup, and options page. The content script does NOT import
// this file (content scripts cannot use ES modules), so anything the content
// script needs is duplicated there deliberately and kept minimal.
//
// There is no text anywhere in this file or this data model. The entire stored
// shape is: dates -> platform hostnames -> integer counts. Read it and confirm.
// -----------------------------------------------------------------------------

/** chrome.storage.local keys. Everything TypeLens stores lives under these. */
export const KEYS = {
  SETTINGS: 'tl_settings',
  DAYS: 'tl_days', // { "YYYY-MM-DD": { "<hostname>": <integer count> } }
  META: 'tl_meta', // { installedAt: <epoch ms>, version: "x.y.z" }
};

/**
 * Default platforms. These match the host_permissions and static content_scripts
 * declared in manifest.json. `match` is a hostname suffix (see hostMatchesSite).
 * Users can disable any of these or add their own in Settings.
 */
export const DEFAULT_SITES = [
  { id: 'claude', match: 'claude.ai', label: 'Claude', color: '#d97757', builtin: true, enabled: true },
  { id: 'chatgpt', match: 'chatgpt.com', label: 'ChatGPT', color: '#10a37f', builtin: true, enabled: true },
  { id: 'chatgpt-legacy', match: 'chat.openai.com', label: 'ChatGPT', color: '#10a37f', builtin: true, enabled: true },
  { id: 'gemini', match: 'gemini.google.com', label: 'Gemini', color: '#4285f4', builtin: true, enabled: true },
  { id: 'perplexity', match: 'perplexity.ai', label: 'Perplexity', color: '#20808d', builtin: true, enabled: true },
];

/** A fresh, default settings object. */
export function defaultSettings() {
  return {
    paused: false,
    sites: structuredClone(DEFAULT_SITES),
    hours: { enabled: false, start: '09:00', end: '17:00' },
  };
}

/**
 * Does a page hostname belong to a configured site?
 * Matches exact host or any subdomain of `site.match`.
 * e.g. site.match "claude.ai" matches "claude.ai" and "www.claude.ai".
 */
export function hostMatchesSite(hostname, matchSuffix) {
  if (!hostname || !matchSuffix) return false;
  hostname = hostname.toLowerCase();
  matchSuffix = matchSuffix.toLowerCase();
  return hostname === matchSuffix || hostname.endsWith('.' + matchSuffix);
}

/** Find the configured site (if any) that a hostname belongs to. */
export function siteForHost(sites, hostname) {
  return sites.find((s) => hostMatchesSite(hostname, s.match)) || null;
}

// -----------------------------------------------------------------------------
// Date helpers — all local-time based so "today" means the user's today.
// -----------------------------------------------------------------------------

/** Local YYYY-MM-DD for a Date (defaults to now). */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD key back into a local Date at midnight. */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// -----------------------------------------------------------------------------
// Equivalents — the fun part. Turns a raw character count into relatable units.
// Every constant is documented and conservative. Words use the standard
// "5 characters per word" convention used by typing tests everywhere.
// -----------------------------------------------------------------------------

export const CHARS_PER_WORD = 5; // standard convention (incl. one trailing space)
export const WORDS_PER_PAGE = 500; // ~ single-spaced manuscript page
export const WORDS_PER_ESSAY = 1500; // a typical college essay
export const WORDS_PER_HP_CHAPTER = 4400; // avg chapter, Harry Potter series
export const WORDS_PER_BOOK = 80000; // a typical novel
export const WORDS_PER_HP_SERIES = 1084170; // all 7 Harry Potter books combined

export function toWords(chars) {
  return chars / CHARS_PER_WORD;
}

/**
 * Build a list of human equivalents for a character count, best-unit-first.
 * Returns [{ label, value, plural }] already formatted for display.
 */
export function equivalents(chars) {
  const words = toWords(chars);
  return [
    { key: 'words', label: 'words', value: words },
    { key: 'pages', label: 'pages', value: words / WORDS_PER_PAGE },
    { key: 'essays', label: 'essays', value: words / WORDS_PER_ESSAY },
    { key: 'chapters', label: 'Harry Potter chapters', value: words / WORDS_PER_HP_CHAPTER },
    { key: 'books', label: 'novels', value: words / WORDS_PER_BOOK },
    { key: 'series', label: 'Harry Potter series', value: words / WORDS_PER_HP_SERIES },
  ];
}

/** Pick the single most "impressive but true" equivalent for a hero line. */
export function heroEquivalent(chars) {
  const words = toWords(chars);
  if (words >= WORDS_PER_HP_SERIES) {
    return fmtUnit(words / WORDS_PER_HP_SERIES, 'complete Harry Potter series');
  }
  if (words >= WORDS_PER_BOOK) {
    return fmtUnit(words / WORDS_PER_BOOK, 'full-length novel', 'full-length novels');
  }
  if (words >= WORDS_PER_HP_CHAPTER) {
    return fmtUnit(words / WORDS_PER_HP_CHAPTER, 'Harry Potter chapter', 'Harry Potter chapters');
  }
  if (words >= WORDS_PER_ESSAY) {
    return fmtUnit(words / WORDS_PER_ESSAY, 'college essay', 'college essays');
  }
  if (words >= WORDS_PER_PAGE) {
    return fmtUnit(words / WORDS_PER_PAGE, 'page', 'pages');
  }
  return fmtUnit(words, 'word', 'words');
}

function fmtUnit(value, singular, plural = singular + 's') {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const unit = rounded === 1 ? singular : plural;
  return `${formatNumber(rounded)} ${unit}`;
}

// -----------------------------------------------------------------------------
// Number formatting
// -----------------------------------------------------------------------------

/** 1234567 -> "1,234,567" (or "1.2M" style for very large via formatCompact). */
export function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** Compact form for hero numbers: 2,340,000 -> "2.3M". */
export function formatCompact(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return trimZero(n / 1000) + 'K';
  if (n < 1_000_000_000) return trimZero(n / 1_000_000) + 'M';
  return trimZero(n / 1_000_000_000) + 'B';
}

function trimZero(x) {
  return (Math.round(x * 10) / 10).toString();
}

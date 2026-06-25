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
    universe: 'hp', // which "Compare to" reference is selected in the popup
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

// =============================================================================
// Equivalents v2 — "Compare to" universes.
//
// A character count on its own is abstract. These reference universes turn it
// into something you can feel — "you've written 36% of the Harry Potter series".
//
// Each universe carries:
//   units      — individual item sizes (ascending). Used for the one-line
//                equivalent: we pick the largest unit that still reads as >= 0.1.
//   milestones — cumulative checkpoints (ascending). For multi-book series these
//                are the running totals after each book, so once you finish Book 1
//                you naturally start progressing through Book 2, and so on. The
//                last milestone always equals `total`.
//   total      — the "full" reference, used for the headline % framing.
//
// All character counts come from the spec, with documented approximations where
// per-volume numbers weren't provided.
// =============================================================================

const PAGE = 1500;    // characters on a typical printed book page
const CHAPTER = 8500; // average chapter across the Harry Potter books

export const UNIVERSES = [
  {
    id: 'hp',
    pill: 'Harry Potter',
    label: 'Harry Potter',
    totalLabel: 'Harry Potter series',
    totalPhrase: 'The full Harry Potter series',
    total: 6379000,
    units: [
      { size: PAGE, one: 'page', many: 'pages' },
      { size: CHAPTER, one: 'chapter', many: 'chapters' },
      { size: 911000, one: 'Harry Potter book', many: 'Harry Potter books' },
    ],
    // Cumulative after each book: 500k, +617k, +691k, +1.07m, +1.458m, +959k, +1.084m.
    milestones: [
      { at: PAGE, label: 'A page' },
      { at: CHAPTER, label: 'A chapter' },
      { at: 500000, label: 'Book 1 · Philosopher’s Stone' },
      { at: 1117000, label: 'Book 2 · Chamber of Secrets' },
      { at: 1808000, label: 'Book 3 · Prisoner of Azkaban' },
      { at: 2878000, label: 'Book 4 · Goblet of Fire' },
      { at: 4336000, label: 'Book 5 · Order of the Phoenix' },
      { at: 5295000, label: 'Book 6 · Half-Blood Prince' },
      { at: 6379000, label: 'Book 7 · Deathly Hallows' },
    ],
  },
  {
    id: 'lotr',
    pill: 'LOTR',
    label: 'Lord of the Rings',
    totalLabel: 'Hobbit + Lord of the Rings',
    totalPhrase: 'The Hobbit plus the Lord of the Rings trilogy',
    total: 5313000,
    units: [
      { size: PAGE, one: 'page', many: 'pages' },
      { size: CHAPTER, one: 'chapter', many: 'chapters' },
      { size: 1328000, one: 'Tolkien book', many: 'Tolkien books' },
    ],
    // The Hobbit (576k) then the 4.737m trilogy split by the volumes' known word
    // counts (Fellowship 39%, Two Towers 32.5%, Return 28.5%).
    milestones: [
      { at: PAGE, label: 'A page' },
      { at: CHAPTER, label: 'A chapter' },
      { at: 576000, label: 'The Hobbit' },
      { at: 2425000, label: 'The Fellowship of the Ring' },
      { at: 3963000, label: 'The Two Towers' },
      { at: 5313000, label: 'The Return of the King' },
    ],
  },
  {
    id: 'got',
    pill: 'Game of Thrones',
    label: 'A Song of Ice and Fire',
    totalLabel: 'A Song of Ice and Fire',
    totalPhrase: 'The full Song of Ice and Fire saga',
    total: 9132000,
    units: [
      { size: PAGE, one: 'page', many: 'pages' },
      { size: CHAPTER, one: 'chapter', many: 'chapters' },
      { size: 1826000, one: 'Westeros book', many: 'Westeros books' },
    ],
    // Book 1 = 1.555m (given). Books 2–5 split the remaining 7.577m by known
    // word counts so the five sum to the 9.132m series total.
    milestones: [
      { at: PAGE, label: 'A page' },
      { at: CHAPTER, label: 'A chapter' },
      { at: 1555000, label: 'A Game of Thrones' },
      { at: 3233000, label: 'A Clash of Kings' },
      { at: 5416000, label: 'A Storm of Swords' },
      { at: 6960000, label: 'A Feast for Crows' },
      { at: 9132000, label: 'A Dance with Dragons' },
    ],
  },
  {
    id: 'classics',
    pill: 'Classics',
    label: 'Classic Literature',
    totalLabel: 'War and Peace',
    totalPhrase: 'War and Peace',
    total: 3227000,
    units: [
      { size: 287000, one: 'copy of The Great Gatsby', many: 'copies of The Great Gatsby' },
      { size: 475000, one: 'copy of 1984', many: 'copies of 1984' },
      { size: 3227000, one: 'copy of War and Peace', many: 'copies of War and Peace' },
    ],
    // Standalone works ordered by length — a climb, not a cumulative series.
    milestones: [
      { at: 287000, label: 'The Great Gatsby' },
      { at: 475000, label: '1984' },
      { at: 3227000, label: 'War and Peace' },
    ],
  },
  {
    id: 'academic',
    pill: 'Academic',
    label: 'Academic Writing',
    totalLabel: 'a PhD thesis',
    totalPhrase: 'A full PhD thesis',
    total: 350000,
    units: [
      { size: 7500, one: 'college essay', many: 'college essays' },
      { size: 45000, one: 'academic paper', many: 'academic papers' },
      { size: 350000, one: 'PhD thesis', many: 'PhD theses' },
    ],
    milestones: [
      { at: 7500, label: 'A college essay' },
      { at: 45000, label: 'An academic paper' },
      { at: 350000, label: 'A PhD thesis' },
    ],
  },
  {
    id: 'internet',
    pill: 'Internet',
    label: 'The Internet',
    totalLabel: 'a Wikipedia featured article',
    totalPhrase: 'A Wikipedia featured article',
    total: 60000,
    units: [
      { size: 280, one: 'tweet', many: 'tweets' },
      { size: 1200, one: 'Reddit post', many: 'Reddit posts' },
      { size: 15000, one: 'Wikipedia article', many: 'Wikipedia articles' },
      { size: 60000, one: 'Wikipedia featured article', many: 'Wikipedia featured articles' },
    ],
    // Reddit post (~1.2k) and featured article (~60k) are reasonable approximations;
    // tweet (280) and standard Wikipedia article (15k) are from the spec.
    milestones: [
      { at: 280, label: 'A tweet' },
      { at: 1200, label: 'A Reddit post' },
      { at: 15000, label: 'A Wikipedia article' },
      { at: 60000, label: 'A Wikipedia featured article' },
    ],
  },
  {
    id: 'random',
    pill: 'Random',
    label: 'Random & Fun',
    kind: 'fun',
  },
];

/** The playful "Random & Fun" equivalents. Each turns chars into a count. */
export const FUN_ITEMS = [
  { size: 12, text: (n) => `enough to name ${n} sandwiches` },
  { size: 8, text: (n) => `enough for ${n} IKEA product names` },
  { size: 280, text: (n) => `${n} tweets nobody asked for` },
  { size: 450, text: (n) => `${n} “just circling back” emails` },
  { size: 40, text: (n) => `${n} fortune-cookie fortunes` },
  { size: 180, text: (n) => `${n} pizza orders` },
  { size: 65, text: (n) => `${n} passive-aggressive sticky notes — enough to wallpaper a small office` },
  { size: 320, text: (n) => `${n} LinkedIn humble-brags` },
];

export function getUniverse(id) {
  return UNIVERSES.find((u) => u.id === id) || UNIVERSES[0];
}

/**
 * One-line equivalent: the largest unit that still reads as >= 0.1, so the
 * number always lands in a satisfying range and is never 0.
 */
export function bestEquivalent(chars, universe) {
  const units = universe.units;
  if (!units || !units.length) return '';
  for (let i = units.length - 1; i >= 0; i--) {
    const v = chars / units[i].size;
    if (v >= 0.1) return fmtEquiv(v, units[i]);
  }
  return fmtEquiv(chars / units[0].size, units[0]);
}

function fmtEquiv(value, unit) {
  const r = Math.max(0.1, round1(value));
  const label = r === 1 ? unit.one : unit.many;
  return `${fmtVal(r)} ${label}`;
}

/**
 * Progression stats for a universe panel: overall % of the full reference, the
 * milestone just reached, the one coming next, and progress through that segment.
 * Past 100% we report a multiplier ("1.4× the full series").
 */
export function universeStats(chars, universe) {
  const ms = universe.milestones || [];
  const total = universe.total || (ms.length ? ms[ms.length - 1].at : 1);

  let reached = null;
  let next = null;
  for (const m of ms) {
    if (chars >= m.at) reached = m;
    else { next = m; break; }
  }

  const prevAt = reached ? reached.at : 0;
  const nextAt = next ? next.at : total;
  const segmentPct = nextAt > prevAt ? clamp(((chars - prevAt) / (nextAt - prevAt)) * 100, 0, 100) : 100;

  return {
    total,
    totalLabel: universe.totalLabel,
    pct: (chars / total) * 100,
    complete: chars >= total,
    multiplier: chars / total,
    reached,
    next,
    segmentPct,
  };
}

/** Pick a fun equivalent by index (wraps). Count is never below 1. */
export function funEquivalent(chars, index) {
  const len = FUN_ITEMS.length;
  const item = FUN_ITEMS[((index % len) + len) % len];
  const n = Math.max(1, Math.round(chars / item.size));
  return item.text(formatNumber(n));
}

// --- small number helpers ----------------------------------------------------

function round1(v) { return Math.round(v * 10) / 10; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** One-decimal display, trailing .0 dropped, commas past 1,000. */
export function fmtVal(r) {
  if (r >= 1000) return Math.round(r).toLocaleString('en-US');
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Human percentage: never a bare 0 — tiny values read as "<0.1%". */
export function formatPercent(pct) {
  if (pct >= 100) return Math.round(pct).toLocaleString('en-US');
  if (pct >= 10) return String(Math.round(pct));
  if (pct >= 0.1) return (Math.round(pct * 10) / 10).toFixed(1);
  return '<0.1';
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

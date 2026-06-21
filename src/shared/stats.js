// stats.js
// -----------------------------------------------------------------------------
// Pure aggregation helpers over the day-bucket data model and thin wrappers
// around chrome.storage.local. No text, no network — only integers in and out.
// -----------------------------------------------------------------------------

import {
  KEYS,
  defaultSettings,
  dayKey,
  parseDayKey,
  siteForHost,
} from './constants.js';

// --- raw storage access ------------------------------------------------------

export async function getSettings() {
  const out = await chrome.storage.local.get(KEYS.SETTINGS);
  const stored = out[KEYS.SETTINGS];
  // Merge onto defaults so new fields appear for users who installed earlier.
  return { ...defaultSettings(), ...(stored || {}) };
}

export async function setSettings(settings) {
  await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
}

export async function getDays() {
  const out = await chrome.storage.local.get(KEYS.DAYS);
  return out[KEYS.DAYS] || {};
}

export async function getMeta() {
  const out = await chrome.storage.local.get(KEYS.META);
  return out[KEYS.META] || null;
}

// --- the only write path for counts -----------------------------------------

/**
 * Add `count` keystrokes for a hostname to today's bucket. This is the single
 * place where counts are ever incremented. It takes a plain integer and a
 * hostname string; it has no access to and no concept of what was typed.
 */
export async function addCount(hostname, count) {
  if (!Number.isFinite(count) || count <= 0 || !hostname) return;
  const days = await getDays();
  const today = dayKey();
  const bucket = days[today] || (days[today] = {});
  bucket[hostname] = (bucket[hostname] || 0) + Math.floor(count);
  await chrome.storage.local.set({ [KEYS.DAYS]: days });
}

// --- aggregation -------------------------------------------------------------

/**
 * Build the full summary the popup renders: totals for today / week / month /
 * all-time, a per-platform breakdown for all-time, and a day-by-day series for
 * the activity grid. `sites` is used only to map hostnames to friendly labels.
 */
export function summarize(days, sites) {
  const now = new Date();
  const todayK = dayKey(now);

  // Week starts Monday.
  const weekStart = new Date(now);
  const dow = (weekStart.getDay() + 6) % 7; // 0 = Monday
  weekStart.setDate(weekStart.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let today = 0;
  let week = 0;
  let month = 0;
  let all = 0;
  const perPlatform = new Map(); // label -> { label, color, total }
  const series = []; // { date, total }

  for (const [k, bucket] of Object.entries(days)) {
    const date = parseDayKey(k);
    let dayTotal = 0;
    for (const [host, c] of Object.entries(bucket)) {
      const n = Number(c) || 0;
      dayTotal += n;
      all += n;

      const site = siteForHost(sites, host);
      const label = site ? site.label : host;
      const color = site ? site.color : '#8b8b8b';
      const entry = perPlatform.get(label) || { label, color, total: 0 };
      entry.total += n;
      perPlatform.set(label, entry);
    }
    if (k === todayK) today += dayTotal;
    if (date >= weekStart) week += dayTotal;
    if (date >= monthStart) month += dayTotal;
    series.push({ date: k, total: dayTotal });
  }

  series.sort((a, b) => (a.date < b.date ? -1 : 1));

  const platforms = [...perPlatform.values()].sort((a, b) => b.total - a.total);

  return { today, week, month, all, platforms, series };
}

/**
 * Produce a fixed-length daily series ending today, filling gaps with 0.
 * Used by the contribution grid. `weeks` columns of 7 days.
 */
export function gridSeries(days, weeks = 26) {
  const totalDays = weeks * 7;
  const map = new Map();
  for (const [k, bucket] of Object.entries(days)) {
    let t = 0;
    for (const c of Object.values(bucket)) t += Number(c) || 0;
    map.set(k, t);
  }

  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Align end so the last column ends on the current week (Sunday end).
  const endDow = today.getDay(); // 0 = Sunday
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - endDow)); // pad to end of this week

  const start = new Date(end);
  start.setDate(start.getDate() - (totalDays - 1));

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = dayKey(d);
    const future = d > today;
    out.push({ date: k, total: future ? null : map.get(k) || 0 });
  }
  return out;
}

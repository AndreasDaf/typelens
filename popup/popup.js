// popup.js — renders the TypeLens popup from local data only.

import {
  formatNumber,
  formatCompact,
  equivalents,
  heroEquivalent,
  parseDayKey,
} from '../src/shared/constants.js';
import { getSettings, getDays, getMeta, setSettings, summarize, gridSeries } from '../src/shared/stats.js';

const $ = (id) => document.getElementById(id);

let state = {
  scope: 'all',
  summary: null,
  settings: null,
};

async function load() {
  const [settings, days, meta] = await Promise.all([getSettings(), getDays(), getMeta()]);
  state.settings = settings;
  state.summary = summarize(days, settings.sites);
  state.grid = gridSeries(days, 26);
  state.meta = meta;
  render();
}

function scopeTotal() {
  const s = state.summary;
  return { today: s.today, week: s.week, month: s.month, all: s.all }[state.scope];
}

const SCOPE_LABELS = { today: 'today', week: 'this week', month: 'this month', all: 'all time' };

function render() {
  renderPaused();
  renderScopes();
  renderHero();
  renderEquivGrid();
  renderPlatforms();
  renderGrid();
  renderFooter();
}

function renderPaused() {
  const paused = state.settings.paused;
  $('pausedBanner').hidden = !paused;
  $('pauseBtn').classList.toggle('is-paused', paused);
  $('pauseBtn').title = paused ? 'Resume counting' : 'Pause counting';
}

function renderScopes() {
  document.querySelectorAll('.scope').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.scope === state.scope);
  });
}

function renderHero() {
  const total = scopeTotal();
  $('heroNumber').textContent = total >= 100000 ? formatCompact(total) : formatNumber(total);
  $('heroNumber').title = formatNumber(total) + ' characters';
  $('heroScopeLabel').textContent = SCOPE_LABELS[state.scope];
  $('heroEquiv').textContent = '≈ ' + heroEquivalent(total);
}

function renderEquivGrid() {
  const total = scopeTotal();
  const order = ['words', 'pages', 'essays', 'chapters', 'books', 'series'];
  const picks = equivalents(total)
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .slice(0, 6);
  const html = picks
    .map((e) => {
      const v = e.value >= 100 ? formatCompact(e.value) : e.value >= 10 ? Math.round(e.value) : Math.round(e.value * 10) / 10;
      return `<div class="equiv-card"><div class="v">${typeof v === 'number' ? v.toLocaleString('en-US') : v}</div><div class="k">${e.label}</div></div>`;
    })
    .join('');
  $('equivGrid').innerHTML = html;
}

function renderPlatforms() {
  const el = $('platforms');
  const platforms = state.summary.platforms;
  if (!platforms.length || state.summary.all === 0) {
    el.innerHTML = '<div class="empty">No keystrokes counted yet. Go type something to an AI.</div>';
    return;
  }
  const max = Math.max(...platforms.map((p) => p.total), 1);
  el.innerHTML = platforms
    .map((p) => {
      const pct = Math.max(3, Math.round((p.total / max) * 100));
      return `<div class="pf-row">
        <span class="pf-name">${escapeHtml(p.label)}</span>
        <span class="pf-bar"><span class="pf-fill" style="width:${pct}%;background:${p.color}"></span></span>
        <span class="pf-val">${formatNumber(p.total)}</span>
      </div>`;
    })
    .join('');
}

function renderGrid() {
  const cells = state.grid;
  const max = Math.max(...cells.map((c) => c.total || 0), 1);
  const level = (n) => {
    if (n == null) return 'future';
    if (n === 0) return 'l0';
    const r = n / max;
    if (r > 0.66) return 'l4';
    if (r > 0.4) return 'l3';
    if (r > 0.15) return 'l2';
    return 'l1';
  };
  $('activityGrid').innerHTML = cells
    .map((c) => {
      const lv = level(c.total);
      const label =
        c.total == null
          ? ''
          : `${formatNumber(c.total)} characters on ${formatDate(c.date)}`;
      return `<span class="cell ${lv}" title="${label}"></span>`;
    })
    .join('');

  const first = cells.find((c) => c.total != null);
  if (first) $('gridRange').textContent = `· last 6 months`;
}

function renderFooter() {
  if (state.meta?.installedAt) {
    $('sinceLabel').textContent = 'Since ' + formatDate(new Date(state.meta.installedAt));
  }
}

// --- events ---

$('scopes').addEventListener('click', (e) => {
  const btn = e.target.closest('.scope');
  if (!btn) return;
  state.scope = btn.dataset.scope;
  render();
});

async function togglePause() {
  state.settings.paused = !state.settings.paused;
  await setSettings(state.settings);
  chrome.runtime.sendMessage({ type: 'tl_refresh_badge' }, () => void chrome.runtime.lastError);
  renderPaused();
}

$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', togglePause);
$('settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('footerSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Live-update if counts or settings change while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.tl_days || changes.tl_settings)) load();
});

// --- utils ---

function formatDate(d) {
  const date = d instanceof Date ? d : parseDayKey(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

load();

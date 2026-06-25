// popup.js — renders the TypeLens popup from local data only.

import {
  formatNumber,
  formatCompact,
  formatPercent,
  parseDayKey,
  UNIVERSES,
  FUN_ITEMS,
  getUniverse,
  bestEquivalent,
  universeStats,
  funEquivalent,
} from '../src/shared/constants.js';
import { getSettings, getDays, getMeta, setSettings, summarize, gridSeries } from '../src/shared/stats.js';

const $ = (id) => document.getElementById(id);

const state = {
  scope: 'all',
  universeId: 'hp',
  funIndex: null,
  summary: null,
  grid: null,
  settings: null,
  meta: null,
};

async function load() {
  const [settings, days, meta] = await Promise.all([getSettings(), getDays(), getMeta()]);
  state.settings = settings;
  state.universeId = settings.universe || 'hp';
  if (state.funIndex == null) state.funIndex = Math.floor(Math.random() * FUN_ITEMS.length);
  state.summary = summarize(days, settings.sites);
  state.grid = gridSeries(days, 13); // ~90 days, 13 week-columns
  state.meta = meta;
  render();
}

const SCOPE_LABELS = { today: 'today', week: 'this week', month: 'this month', all: 'all time' };

function scopeTotal() {
  const s = state.summary;
  return { today: s.today, week: s.week, month: s.month, all: s.all }[state.scope];
}

function render() {
  renderPaused();
  renderScopes();
  renderCompareBtn();
  renderHero();
  renderUniverse();
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

function renderCompareBtn() {
  const universe = getUniverse(state.universeId);
  $('compareBtnValue').textContent = universe.label;
}

const UNIVERSE_DESC = {
  hp:       '7 books · 6.4M characters',
  lotr:     'Hobbit + trilogy · 5.3M characters',
  got:      '5 books · 9.1M characters',
  classics: 'Gatsby → 1984 → War and Peace',
  academic: 'College essay → paper → PhD thesis',
  internet: 'Tweet → Reddit post → Wikipedia',
  random:   'Sandwiches, IKEA names, sticky notes & more',
};

function showPicker() {
  const el = $('universePicker');
  el.hidden = false;
  $('compareBtn').setAttribute('aria-expanded', 'true');
  $('universeList').innerHTML = UNIVERSES.map((u) => `
    <button class="picker-item${u.id === state.universeId ? ' is-selected' : ''}" data-id="${u.id}">
      <span class="picker-dot"></span>
      <span class="picker-item-body">
        <span class="picker-item-name">${escapeHtml(u.label)}</span>
        <span class="picker-item-desc">${escapeHtml(UNIVERSE_DESC[u.id] || '')}</span>
      </span>
      <svg class="picker-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M2.5 9l4 4 7-8"/>
      </svg>
    </button>`).join('');
}

function closePicker() {
  $('universePicker').hidden = true;
  $('compareBtn').setAttribute('aria-expanded', 'false');
}

function renderHero() {
  const total = scopeTotal();
  $('heroNumber').textContent = total >= 100000 ? formatCompact(total) : formatNumber(total);
  $('heroNumber').title = formatNumber(total) + ' characters';
  $('heroScopeLabel').textContent = SCOPE_LABELS[state.scope];

  const universe = getUniverse(state.universeId);
  const equiv = $('heroEquiv');
  if (universe.kind === 'fun') {
    // The fun card below is the star; a long fun sentence would overflow this
    // pill, so hide it in Random mode rather than duplicate the text.
    equiv.style.display = 'none';
  } else {
    equiv.style.display = 'inline-block';
    equiv.textContent = '≈ ' + bestEquivalent(total, universe);
  }
}

function renderUniverse() {
  const total = scopeTotal();
  const universe = getUniverse(state.universeId);
  const el = $('universePanel');

  if (universe.kind === 'fun') {
    el.innerHTML = `
      <div class="up-card fun-card">
        <div class="fun-text"><span class="lead">You've typed…</span>${escapeHtml(capitalize(funEquivalent(total, state.funIndex)))}</div>
        <button class="shuffle-btn" id="shuffleBtn" title="Shuffle" aria-label="Shuffle">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18 4l3 3-3 3v-2h-2.5l-2.3 3.2-1.2-1.7 1.9-2.7A1 1 0 0 1 14.6 9H18V7H6V5h12V4zm0 16l3-3-3-3v2h-3.4a1 1 0 0 1-.8-.4l-6-8.4A1 1 0 0 0 6.9 7H3v2h3.4l6 8.4a1 1 0 0 0 .8.4H18v2z"/></svg>
        </button>
      </div>`;
    $('shuffleBtn').addEventListener('click', () => {
      state.funIndex = (state.funIndex + 1) % FUN_ITEMS.length;
      renderUniverse();
      renderHero();
    });
    return;
  }

  const st = universeStats(total, universe);
  const headline = `<b>${escapeHtml(universe.totalPhrase)}</b> contains ${formatNumber(st.total)} characters.`;

  const nowLabel = st.reached ? st.reached.label : 'Just getting started';
  const nextLabel = st.complete
    ? fmtMultiplier(st.multiplier) > 1
      ? `Complete · ${fmtMultiplier(st.multiplier)}× over`
      : 'Complete 🎉'
    : st.next
    ? `Next: ${st.next.label}`
    : 'Complete';

  el.innerHTML = `
    <div class="up-card">
      <div class="up-headline">${headline}</div>
      <div class="up-pct">
        <span class="big">${formatPercent(st.pct)}%</span>
        <span class="of">of that, written to AI tools</span>
      </div>
      <div class="up-progress">
        <div class="up-track"><div class="up-fill" style="width:${Math.max(2, st.segmentPct)}%"></div></div>
        <div class="up-milestones">
          <span class="up-now">${escapeHtml(nowLabel)}</span>
          <span class="up-next">${escapeHtml(nextLabel)}</span>
        </div>
      </div>
    </div>`;
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
      const label = c.total == null ? '' : `${formatNumber(c.total)} characters on ${formatDate(c.date)}`;
      return `<span class="cell ${lv}" title="${label}"></span>`;
    })
    .join('');
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

$('compareBtn').addEventListener('click', showPicker);
$('closePickerBtn').addEventListener('click', closePicker);

$('universeList').addEventListener('click', async (e) => {
  const btn = e.target.closest('.picker-item');
  if (!btn) return;
  state.universeId = btn.dataset.id;
  state.settings.universe = state.universeId;
  await setSettings(state.settings);
  closePicker();
  renderCompareBtn();
  renderHero();
  renderUniverse();
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

// Live-update if counts change while the popup is open. We ignore our own
// settings writes (universe/pause) to avoid clobbering local UI state.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tl_days) load();
});

// --- utils ---

function fmtMultiplier(m) {
  return m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDate(d) {
  const date = d instanceof Date ? d : parseDayKey(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

load();

// options.js — TypeLens settings & privacy page logic. Local-only.

import { KEYS } from '../src/shared/constants.js';
import { getSettings, setSettings, getDays, getMeta } from '../src/shared/stats.js';

const $ = (id) => document.getElementById(id);
let settings = null;

const PALETTE = ['#7c6cf0', '#e08a4b', '#3fb27f', '#4285f4', '#20808d', '#c8588a', '#d4a72c'];

async function init() {
  settings = await getSettings();
  $('version').textContent = chrome.runtime.getManifest().version;
  await showShortcut();
  renderSites();
  renderHours();
  $('pausedToggle').checked = !!settings.paused;
  bind();
}

async function showShortcut() {
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'toggle-pause');
    if (c?.shortcut) $('shortcut').textContent = c.shortcut;
  } catch (_) {}
}

// --- sites -------------------------------------------------------------------

function renderSites() {
  const el = $('siteList');
  if (!settings.sites.length) {
    el.innerHTML = '<p class="muted" style="font-size:13px">No sites tracked. Add one below.</p>';
    return;
  }
  el.innerHTML = settings.sites
    .map(
      (s) => `
      <div class="site" data-id="${s.id}">
        <span class="dot" style="background:${s.color || '#7c6cf0'}"></span>
        <span class="name">${escapeHtml(s.label)}</span>
        <span class="match">${escapeHtml(s.match)}</span>
        <span class="spacer"></span>
        ${s.builtin ? '<span class="tag">default</span>' : ''}
        <button class="site-remove" title="Remove" data-id="${s.id}">&times;</button>
      </div>`
    )
    .join('');

  el.querySelectorAll('.site-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeSite(btn.dataset.id));
  });
}

async function addSite(raw) {
  hideError();
  let host = normalizeHost(raw);
  if (!host) return showError('Please enter a valid website, like grok.com');
  if (settings.sites.some((s) => s.match === host)) return showError('That site is already tracked.');

  // Ask Chrome for permission to run on this host.
  const origins = [`*://${host}/*`, `*://*.${host}/*`];
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins });
  } catch (e) {
    return showError('Could not request permission for that site.');
  }
  if (!granted) return showError('Permission denied. TypeLens can only count on sites you allow.');

  const id = 'custom-' + host.replace(/[^a-z0-9]+/gi, '-');
  const color = PALETTE[settings.sites.length % PALETTE.length];
  const label = prettyLabel(host);
  settings.sites.push({ id, match: host, label, color, builtin: false, enabled: true });
  await setSettings(settings);
  await chrome.runtime.sendMessage({ type: 'tl_sync_custom' }).catch(() => {});
  $('addInput').value = '';
  renderSites();
}

async function removeSite(id) {
  const site = settings.sites.find((s) => s.id === id);
  if (!site) return;
  settings.sites = settings.sites.filter((s) => s.id !== id);
  await setSettings(settings);

  // For custom sites, also drop the host permission and unregister the script.
  if (!site.builtin) {
    try {
      await chrome.permissions.remove({ origins: [`*://${site.match}/*`, `*://*.${site.match}/*`] });
    } catch (_) {}
    await chrome.runtime.sendMessage({ type: 'tl_sync_custom' }).catch(() => {});
  }
  renderSites();
}

// --- hours -------------------------------------------------------------------

function renderHours() {
  $('hoursEnabled').checked = !!settings.hours.enabled;
  $('hoursStart').value = settings.hours.start || '09:00';
  $('hoursEnd').value = settings.hours.end || '17:00';
  $('hoursFields').hidden = !settings.hours.enabled;
}

async function saveHours() {
  settings.hours = {
    enabled: $('hoursEnabled').checked,
    start: $('hoursStart').value || '09:00',
    end: $('hoursEnd').value || '17:00',
  };
  $('hoursFields').hidden = !settings.hours.enabled;
  await setSettings(settings);
}

// --- data export / delete ----------------------------------------------------

async function exportData() {
  const [days, meta] = await Promise.all([getDays(), getMeta()]);
  const payload = {
    app: 'TypeLens',
    exportedAt: new Date().toISOString(),
    meta,
    settings,
    days,
    note: 'Counts only. This file contains no typed text — TypeLens never stores any.',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `typelens-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flashMsg('Exported. Your data was saved as a JSON file.');
}

async function deleteAll() {
  const sure = confirm(
    'Delete all TypeLens data?\n\nThis erases every count and resets your settings to defaults. This cannot be undone.'
  );
  if (!sure) return;
  await chrome.storage.local.remove([KEYS.DAYS]);
  // Reset settings to defaults but keep custom site permissions as-is.
  const { defaultSettings } = await import('../src/shared/constants.js');
  settings = defaultSettings();
  await setSettings(settings);
  await chrome.storage.local.set({ [KEYS.META]: { installedAt: Date.now(), version: chrome.runtime.getManifest().version } });
  renderSites();
  renderHours();
  $('pausedToggle').checked = false;
  flashMsg('Everything deleted. Starting fresh.');
}

// --- binding -----------------------------------------------------------------

function bind() {
  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addSite($('addInput').value);
  });
  $('hoursEnabled').addEventListener('change', saveHours);
  $('hoursStart').addEventListener('change', saveHours);
  $('hoursEnd').addEventListener('change', saveHours);
  $('pausedToggle').addEventListener('change', async () => {
    settings.paused = $('pausedToggle').checked;
    await setSettings(settings);
    chrome.runtime.sendMessage({ type: 'tl_refresh_badge' }).catch(() => {});
  });
  $('exportBtn').addEventListener('click', exportData);
  $('deleteBtn').addEventListener('click', deleteAll);
}

// --- helpers -----------------------------------------------------------------

function normalizeHost(raw) {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z]+:\/\//.test(s)) s = 'https://' + s;
  try {
    const host = new URL(s).hostname;
    if (!host || !host.includes('.')) return null;
    return host.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function prettyLabel(host) {
  const core = host.replace(/^www\./, '').split('.')[0];
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function showError(m) { const e = $('addError'); e.textContent = m; e.hidden = false; }
function hideError() { $('addError').hidden = true; }
function flashMsg(m) {
  const e = $('dataMsg'); e.textContent = m; e.hidden = false;
  setTimeout(() => (e.hidden = true), 4000);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();

// background.js
// -----------------------------------------------------------------------------
// TypeLens service worker. Responsibilities:
//   1. Receive count messages from content scripts and persist them.
//   2. Toggle pause via the keyboard command and reflect it on the toolbar badge.
//   3. Register/unregister content scripts for user-added custom sites.
//   4. Seed defaults on install.
//
// It receives only integers from content scripts and writes only integers to
// storage. It never opens a network connection.
// -----------------------------------------------------------------------------

import { KEYS, defaultSettings, hostMatchesSite } from './shared/constants.js';
import { getSettings, setSettings, addCount } from './shared/stats.js';

const CUSTOM_SCRIPT_PREFIX = 'tl-custom-';

// --- install / startup -------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([KEYS.SETTINGS, KEYS.META]);
  if (!existing[KEYS.SETTINGS]) {
    await chrome.storage.local.set({ [KEYS.SETTINGS]: defaultSettings() });
  }
  if (!existing[KEYS.META]) {
    await chrome.storage.local.set({
      [KEYS.META]: { installedAt: Date.now(), version: chrome.runtime.getManifest().version },
    });
  }
  await refreshBadge();
  await syncCustomScripts();
  // Static content scripts only inject into pages loaded AFTER install/update.
  // Catch tabs that were already open (e.g. a claude.ai tab open at install).
  await injectExistingTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshBadge();
  await syncCustomScripts();
});

// --- counting ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'tl_count') {
    const host = hostnameFromSender(sender);
    const count = Number(msg.count);
    addCount(host, count).then(() => sendResponse?.({ ok: true }));
    return true; // async response
  }

  if (msg.type === 'tl_sync_custom') {
    syncCustomScripts()
      .then(() => injectExistingTabs())
      .then(() => sendResponse?.({ ok: true }));
    return true;
  }

  if (msg.type === 'tl_refresh_badge') {
    refreshBadge().then(() => sendResponse?.({ ok: true }));
    return true;
  }
});

function hostnameFromSender(sender) {
  try {
    if (sender?.url) return new URL(sender.url).hostname.toLowerCase();
    if (sender?.origin) return new URL(sender.origin).hostname.toLowerCase();
  } catch (_) {}
  return 'unknown';
}

// --- pause command + badge ---------------------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-pause') {
    const settings = await getSettings();
    settings.paused = !settings.paused;
    await setSettings(settings);
    await refreshBadge();
  }
});

async function refreshBadge() {
  const settings = await getSettings();
  if (settings.paused) {
    await chrome.action.setBadgeText({ text: 'II' });
    await chrome.action.setBadgeBackgroundColor({ color: '#b0b0b8' });
    await chrome.action.setTitle({ title: 'TypeLens — paused (Ctrl+Shift+U to resume)' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'TypeLens' });
  }
}

// Keep the badge in sync if pause is toggled from the popup/options too.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEYS.SETTINGS]) {
    refreshBadge();
  }
});

// --- dynamic content scripts for user-added sites ----------------------------
//
// Built-in sites are covered by the static content_scripts entry in the
// manifest. Custom sites the user adds are registered here at runtime, but only
// for hosts the user has granted optional host permission to.

async function syncCustomScripts() {
  if (!chrome.scripting?.registerContentScripts) return;

  const settings = await getSettings();
  const custom = (settings.sites || []).filter((s) => !s.builtin && s.enabled !== false);

  // Remove all of our previously registered custom scripts, then re-add the
  // current set we still hold permission for. Simple and idempotent.
  let registered = [];
  try {
    registered = await chrome.scripting.getRegisteredContentScripts();
  } catch (_) {}
  const ours = registered.filter((s) => s.id.startsWith(CUSTOM_SCRIPT_PREFIX)).map((s) => s.id);
  if (ours.length) {
    try { await chrome.scripting.unregisterContentScripts({ ids: ours }); } catch (_) {}
  }

  const toRegister = [];
  for (const site of custom) {
    const pattern = `*://*.${site.match}/*`;
    const patternExact = `*://${site.match}/*`;
    let granted = false;
    try {
      granted = await chrome.permissions.contains({ origins: [patternExact, pattern] });
    } catch (_) {}
    if (!granted) continue;
    toRegister.push({
      id: CUSTOM_SCRIPT_PREFIX + site.id,
      matches: [patternExact, pattern],
      js: ['src/content.js'],
      runAt: 'document_idle',
      allFrames: true,
    });
  }

  if (toRegister.length) {
    try { await chrome.scripting.registerContentScripts(toRegister); } catch (_) {}
  }
}

// --- inject into already-open tabs -------------------------------------------
//
// Run the counter on tabs that were already open when the extension was
// installed/updated or when a new site was just added. The content script's
// own __typeLensLoaded guard makes a redundant injection a harmless no-op.

async function injectExistingTabs() {
  if (!chrome.scripting?.executeScript) return;
  const settings = await getSettings();
  const sites = settings.sites || [];

  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) {
    return;
  }

  for (const tab of tabs) {
    // `tab.url` is only populated for tabs we hold host permission for, so we
    // never even see URLs of sites the user isn't tracking.
    if (!tab.id || !tab.url) continue;
    let host;
    try {
      host = new URL(tab.url).hostname.toLowerCase();
    } catch (_) {
      continue;
    }
    const match = sites.some((s) => s.enabled !== false && hostMatchesSite(host, s.match));
    if (!match) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['src/content.js'],
      });
    } catch (_) {
      // No permission for this tab, or a restricted page — skip silently.
    }
  }
}

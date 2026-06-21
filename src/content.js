// content.js
// =============================================================================
// TypeLens content script — the only code that runs on the pages where you type.
//
//   >>> READ THIS FILE IF YOU READ NOTHING ELSE. <<<
//
// This script's entire job is to add 1 to a number when you press a printable
// key inside a text field. It does not, and structurally cannot, do more:
//
//   * It never builds, concatenates, or stores any string of typed text.
//     The only state it keeps is `pending` — a single integer.
//   * It looks at exactly one property of a keystroke, `event.key`, and only to
//     answer one yes/no question: "is this a single printable character?".
//     It checks `event.key.length === 1`. It never records WHICH character.
//   * It reports to the background worker as `{ count: <integer> }`. No text,
//     no field contents, no field names, no URLs beyond the page hostname.
//   * It makes no network requests of any kind. (Search this file for "fetch",
//     "XMLHttpRequest", "sendBeacon", "WebSocket" — there are none.)
//
// If you can find a line in this file that retains a character of your text,
// it is a bug and a betrayal. There isn't one. — TypeLens
// =============================================================================

(() => {
  'use strict';

  // Guard against double injection. A page that loads after install gets this
  // script via the static manifest declaration; an already-open tab gets it via
  // chrome.scripting.executeScript from the background worker. The isolated
  // world's `window` persists across injections in a frame, so this flag stops
  // us attaching two keydown listeners (which would double-count).
  if (window.__typeLensLoaded) return;
  window.__typeLensLoaded = true;

  const HOSTNAME = location.hostname.toLowerCase();
  const FLUSH_MS = 2000; // batch keystrokes and report at most this often

  // -- The entire data model of this script: one integer. ---------------------
  let pending = 0;

  // -- Live config, mirrored from chrome.storage so toggles apply instantly. --
  // Default ON: this script only ever runs on hosts the user is tracking (the
  // manifest matches plus user-added sites), so the safe default before settings
  // load is to count. Settings can only turn a host OFF, never silently leave it
  // stuck off because of a load race.
  let active = true;
  let paused = false;
  let hours = { enabled: false, start: '09:00', end: '17:00' };
  let windowOverrideUntil = 0; // epoch ms; temporary "keep going" extension
  let debug = false;

  // ---------------------------------------------------------------------------
  // Config loading. We read settings to decide WHETHER to count. We never store
  // anything back here except through the count-only message channel.
  // ---------------------------------------------------------------------------
  function hostMatches(hostname, suffix) {
    suffix = (suffix || '').toLowerCase();
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }

  function applySettings(settings) {
    // No settings yet (first-install race): keep the default-on behaviour.
    // We only run on tracked hosts, so counting is the correct default.
    if (!settings) return;
    paused = !!settings.paused;
    hours = settings.hours || hours;
    const sites = settings.sites || [];
    const site = sites.find((s) => hostMatches(HOSTNAME, s.match));
    // If this host is in the list, honour its enabled flag. If it isn't in the
    // list at all (e.g. the user removed a built-in site), stop counting here.
    active = site ? site.enabled !== false : false;
    if (debug) console.debug('[TypeLens] active =', active, 'on', HOSTNAME, '| paused =', paused);
  }

  chrome.storage.local.get(['tl_settings', 'tl_debug']).then((out) => {
    debug = !!out.tl_debug;
    applySettings(out.tl_settings);
    if (debug) console.debug('[TypeLens] content script running on', HOSTNAME);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.tl_debug) debug = !!changes.tl_debug.newValue;
    if (changes.tl_settings) applySettings(changes.tl_settings.newValue);
  });

  // ---------------------------------------------------------------------------
  // Active-hours window check.
  // ---------------------------------------------------------------------------
  function minutesNow() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseHM(s) {
    const [h, m] = String(s).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function withinWindow() {
    if (!hours.enabled) return true;
    if (Date.now() < windowOverrideUntil) return true;
    const now = minutesNow();
    const start = parseHM(hours.start);
    const end = parseHM(hours.end);
    // Support overnight windows (e.g. 22:00–02:00).
    return start <= end ? now >= start && now < end : now >= start || now < end;
  }

  // ---------------------------------------------------------------------------
  // Is the user actually typing into an editable field? We only count writing,
  // not page navigation or keyboard shortcuts. This inspects element type only,
  // never element contents.
  // ---------------------------------------------------------------------------
  // Deliberately excludes 'password' — TypeLens does not even count keystrokes
  // in password fields, let alone look at them.
  const TEXT_INPUT_TYPES = new Set([
    'text', 'search', 'email', 'url', 'tel', 'number', '',
  ]);

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return TEXT_INPUT_TYPES.has((el.type || '').toLowerCase());
    return false;
  }

  // ---------------------------------------------------------------------------
  // The counter. This is the whole product.
  // ---------------------------------------------------------------------------
  function shouldCount(e) {
    if (!active || paused) return false;
    if (!withinWindow()) {
      maybeAskToContinue();
      return false;
    }
    if (!isEditable(e.target)) return false;
    return true;
  }

  document.addEventListener(
    'keydown',
    (e) => {
      // Ignore IME composition keydowns; composed text is counted on
      // 'compositionend' instead (see below) to avoid double counting.
      if (e.isComposing || e.keyCode === 229) return;

      // Ignore keyboard shortcuts and non-text keys. We count a keystroke only
      // when it is a lone printable character with no command modifier held.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key == null || e.key.length !== 1) return; // <- the only look at e.key

      if (!shouldCount(e)) return;

      pending += 1; // the keystroke's content is now gone forever
    },
    true // capture, so we see it regardless of where it's handled
  );

  // IME (e.g. Chinese/Japanese/Korean) input: one composition can produce
  // several characters. We add the *length* of the committed string — a number —
  // and never keep the string itself.
  document.addEventListener(
    'compositionend',
    (e) => {
      if (!active || paused || !withinWindow()) return;
      if (!isEditable(e.target)) return;
      const len = e.data ? e.data.length : 0; // a number, then discarded
      if (len > 0) pending += len;
    },
    true
  );

  // ---------------------------------------------------------------------------
  // Reporting. Send the accumulated integer to the background worker, then zero
  // it. If the worker is briefly unavailable, keep the count and retry next tick.
  // ---------------------------------------------------------------------------
  function flush() {
    if (pending <= 0) return;
    const count = pending;
    pending = 0;
    if (debug) console.debug('[TypeLens] flushing', count, 'keystrokes');
    try {
      chrome.runtime.sendMessage({ type: 'tl_count', count }, () => {
        // Swallow "receiving end does not exist" during SW restarts.
        void chrome.runtime.lastError;
      });
    } catch (_) {
      // Extension context invalidated (e.g. update/reload). Drop silently.
      pending += count;
    }
  }

  setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  // ---------------------------------------------------------------------------
  // Gentle "your window ended — keep going?" prompt. Shown at most once per
  // window-end, as a small unobtrusive toast. Pure DOM, no text capture.
  // ---------------------------------------------------------------------------
  let askedThisSession = false;

  function maybeAskToContinue() {
    if (askedThisSession || document.getElementById('tl-toast')) return;
    askedThisSession = true;

    const toast = document.createElement('div');
    toast.id = 'tl-toast';
    toast.setAttribute('role', 'dialog');
    toast.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:20px', 'bottom:20px',
      'max-width:300px', 'padding:14px 16px', 'border-radius:12px',
      'background:#1c1b22', 'color:#f4f4f6', 'box-shadow:0 8px 30px rgba(0,0,0,.35)',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      'border:1px solid rgba(255,255,255,.08)',
    ].join(';');

    const msg = document.createElement('div');
    msg.textContent = 'Your TypeLens tracking window has ended. Keep counting for another hour?';
    msg.style.marginBottom = '10px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const no = document.createElement('button');
    no.textContent = 'No thanks';
    no.style.cssText = btnStyle('transparent', '#c9c9d1');

    const yes = document.createElement('button');
    yes.textContent = 'Keep going';
    yes.style.cssText = btnStyle('#6c5ce7', '#fff');

    no.addEventListener('click', () => toast.remove());
    yes.addEventListener('click', () => {
      windowOverrideUntil = Date.now() + 60 * 60 * 1000; // +1 hour
      toast.remove();
    });

    row.append(no, yes);
    toast.append(msg, row);
    (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), 12000);
  }

  function btnStyle(bg, color) {
    return [
      `background:${bg}`, `color:${color}`, 'border:none', 'cursor:pointer',
      'padding:6px 12px', 'border-radius:8px', 'font-size:13px', 'font-weight:600',
    ].join(';');
  }

  // Reset the "asked" flag once we are back inside the window, so the next
  // window-end will prompt again on a future day.
  setInterval(() => {
    if (withinWindow()) askedThisSession = false;
  }, 60 * 1000);
})();

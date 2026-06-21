# TypeLens Privacy

TypeLens is built so that respecting your privacy is not a promise we ask you to
trust — it's a fact you can verify by reading the code.

## The short version

- **No text is ever stored.** Not your messages, not field contents, not a single
  character of what you type. Anywhere. Ever.
- **Nothing leaves your device.** No servers, no accounts, no sync, no analytics,
  no telemetry, no network requests of any kind.
- **No third-party code.** No frameworks, no CDNs, no bundled libraries.
- **Works fully offline.** Disconnect from the internet and TypeLens behaves
  identically — because it never needed the internet.
- **You own your data.** Export it as JSON or delete all of it instantly, anytime.

## The life of a keystroke

1. **You press a key.** A `keydown` listener in [`src/content.js`](src/content.js)
   notices a key went down inside a text field.
2. **One yes/no question is asked:** "is this a single printable character?" The
   code checks `event.key.length === 1`. It never records *which* character —
   only whether it was printable.
3. **If yes, an integer increments by one.** That integer (`pending`) is the only
   state the content script keeps. The keystroke's content is already gone.
4. **Every ~2 seconds**, that integer is sent to the background worker as
   `{ count: <number> }` — just a number and the page's hostname.
5. **The background worker adds it** to today's total for that site in
   `chrome.storage.local`. The stored shape is:
   `{ "2026-06-20": { "claude.ai": 1234 } }` — dates → site names → counts.
6. **That's the end.** There is no step where text is written down, because no
   part of the pipeline ever holds text.

## What is stored, exactly

Three keys in `chrome.storage.local`, all local to your browser:

- `tl_days` — daily per-site counts (integers only).
- `tl_settings` — your tracked sites, active-hours window, and pause state.
- `tl_meta` — the date you installed and the version number.

That's everything. You can see it for yourself in the export file
(**Settings → Export my data**).

## Permissions, explained

- **`storage`** — to save your counts and settings locally.
- **`scripting`** — to start counting on custom sites *you* add (built-in sites
  use the static declaration in the manifest).
- **Host access** — TypeLens runs only on the sites you track. The defaults are
  Claude, ChatGPT, Gemini, and Perplexity. Adding any other site triggers a
  Chrome permission prompt for that specific site, which you must approve.

## Verify it yourself

The most important file is [`src/content.js`](src/content.js) — the only code
that runs on the pages where you type. Search it for `fetch`, `XMLHttpRequest`,
`sendBeacon`, or `WebSocket`: there are none. Search for anywhere a string of
typed characters is kept: there are none.

If you find a single line that contradicts anything on this page, it's a bug —
please open an issue. The transparency *is* the product.

# TypeLens

**How much have you actually *written* — with your own hands — to AI tools?**

Not read. Not scrolled. Not consumed. Typed. TypeLens quietly counts the
characters you type into Claude, ChatGPT, Gemini, Perplexity — or any site you
choose — and shows you the number. Today, this week, this month, all time, with
fun equivalents (pages, essays, Harry Potter chapters, whole book series) and a
GitHub-style activity grid.

It runs entirely on your device. It never stores a single character of what you
type. It makes zero network requests. This isn't a privacy *policy* — it's how
the code is built.

---

## The privacy guarantee, in one paragraph

A keystroke happens → a number goes up by one → the keystroke is gone. That is
the entire data model. The only thing TypeLens ever stores is integers keyed by
date and site name (`"2026-06-20" → { "claude.ai": 1234 }`). There is nowhere
for your words to live, because nothing in the code ever holds them. No servers,
no accounts, no sync, no external calls, no bundled libraries. Unplug your
internet and it works identically, forever.

Read [`src/content.js`](src/content.js) — the only file that runs where you type
— and confirm it yourself. The whole thing is ~200 lines.

## How it works

| Piece | File | Job |
|---|---|---|
| Counter | [`src/content.js`](src/content.js) | Listens for printable keystrokes in text fields, keeps a single integer, reports it as a count every 2s. Never touches text. |
| Storage | [`src/background.js`](src/background.js) | Receives integers, adds them to today's per-site total in `chrome.storage.local`. Handles the pause shortcut and custom-site registration. |
| Popup | [`popup/`](popup/) | Shows your numbers, equivalents, per-platform breakdown, and activity grid. |
| Settings | [`options/`](options/) | Add/remove sites, set active hours, pause, export, delete, and read the plain-language privacy explanation. |
| Shared | [`src/shared/`](src/shared/) | Pure helpers: constants, equivalents math, aggregation. No text, no I/O. |

### What counts as a "character"
A single printable key (`event.key.length === 1`) pressed inside an editable
field, with no Ctrl/Cmd/Alt modifier. Keyboard shortcuts, navigation keys, and
pasting do **not** count — this is meant to measure what you actually *wrote*.
IME (Chinese/Japanese/Korean) input is counted by the *length* of the committed
text on `compositionend`, never its contents.

## Install (load unpacked)

1. Download or clone this folder.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Pin TypeLens and start typing to an AI. Open the popup to watch the number grow.

> The PNG icons are committed, so no build step is required. If you ever want to
> regenerate them: `node scripts/generate-icons.js` (uses only Node built-ins).

## Default tracked sites
Claude, ChatGPT (`chatgpt.com` + `chat.openai.com`), Gemini, Perplexity. You can
disable any of these or add your own from **Settings** — adding a site asks
Chrome for permission to run on just that site.

## Features
- **Scopes:** today / this week / this month / all time.
- **Equivalents:** words, pages, essays, Harry Potter chapters, novels, whole HP series.
- **Per-platform breakdown** with a simple bar chart.
- **Activity grid** — your last 6 months, contribution-graph style.
- **Pause** with `Ctrl+Shift+U` (⌘⇧U on Mac), from the popup, or in Settings.
- **Active hours** — only count during set hours; if your window ends mid-sentence, it asks before stopping.
- **Export** your data as JSON, or **delete everything** instantly.

## Tech
Manifest V3. Vanilla JavaScript (ES modules), HTML, CSS. **No frameworks, no
build step, no dependencies, no network.** Designed to be read top to bottom by
anyone.

## License
MIT — see [LICENSE](LICENSE).

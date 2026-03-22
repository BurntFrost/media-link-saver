# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bash scripts/package.sh   # Build distributable .zip in dist/
```

No npm, build tools, test runner, or linter. Files load directly into Chrome. To develop:
1. `chrome://extensions/` → Enable Developer mode → Load unpacked (select repo root)
2. Edit files → click reload on extension card
3. For popup: close/reopen. For content script: reload target page.

## Architecture

**Media Link Saver** is a Manifest V3 Chrome extension that discovers every image, video, and audio file on webpages and enables bulk downloading. Zero external dependencies — vanilla JavaScript only.

### Components (message-passing architecture)

- **`popup/popup.js`** (~1,869 lines) — UI layer: grid/list views, filters, search, sort, dimension filters, selection, format conversion, ZIP toggle, hover preview, downloads
- **`content/content.js`** (~798 lines) — On-demand injected DOM scanner. Extracts media from 15+ sources (elements, CSS backgrounds, meta tags, JSON-LD, iframes, canvas, shadow DOM, lazy-load attrs, Resource Timing API). Uses MutationObserver.
- **`background/service-worker.js`** (~301 lines) — Download orchestration with concurrency control, blob URL resolution (MAIN world injection), format conversion, ZIP packaging, context menu
- **`options/`** — User settings: cache TTL, download concurrency (2-8), URL exclude patterns
- **`sidepanel/`** — Side panel wrapper reusing popup.js

### Message Flow

```
Popup → Content: { action: 'getMedia' } → Content → Popup: { media: [...] }
Popup → Service Worker: { action: 'download', url, filename }
```

### Storage

- **IndexedDB** (`MediaLinkSaverDB`): media cache with configurable TTL (1-30 min)
- **Chrome Storage**: user preferences

## CSP Compliance (Critical)

This extension enforces strict Content Security Policy. **Never use:**
- `innerHTML`, `outerHTML`, `eval()`, `new Function()`
- Inline event handlers (`onclick=`, `onload=`)

**Always use:** `createElement()`, `textContent`, `addEventListener()`. Parse HTML via `<template>` element + `.content`.

Pre-commit hooks in `.claude/settings.json` enforce this automatically.

## Conventions

- Zero dependencies, no build step, no npm
- Minimal permissions: `activeTab` (not `<all_urls>`), on-demand content script injection
- Guard injection with `globalThis.__mediaLinkSaverInjected`
- Max concurrent downloads: 4 (configurable)
- Media list capped at 5,000 items
- See `AGENTS.md` for additional guidance and `.claude/skills/conventions/` for coding conventions

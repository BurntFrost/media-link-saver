---
name: conventions
description: Project conventions and constraints for Media Link Saver Chrome extension
user-invocable: false
---

# Media Link Saver — Project Conventions

## CSP Compliance (MANDATORY)

This extension enforces `script-src 'self'; object-src 'self'`. All code MUST follow:

- **NEVER** use `innerHTML` or `outerHTML` — use `textContent`, `createElement()`, `appendChild()`
- **NEVER** use inline event handlers (`onclick`, `onload`, etc.) — use `addEventListener()` only
- **NEVER** use `eval()` or `new Function()`
- Parse HTML snippets (e.g., `<noscript>` content) via `<template>` element + `.content` property

## Architecture

Three-component message passing — respect boundaries:

| Component | Role | Location |
|-----------|------|----------|
| **Popup** | UI layer, DOM-only rendering, filter/search state | `popup/` |
| **Content Script** | DOM scanning, MutationObserver, media extraction | `content/` |
| **Service Worker** | Download orchestration, blob resolution, concurrency | `background/` |

### Communication
- Popup ↔ Content Script: `chrome.tabs.sendMessage()` / `chrome.runtime.onMessage`
- Popup → Service Worker: `chrome.runtime.sendMessage()`
- Service Worker → Page: `chrome.scripting.executeScript()` with `world: 'MAIN'` (blob resolution only)

## Coding Patterns

### UI Elements (popup only)
```js
const el = document.createElement('div');
el.className = 'my-class';
el.textContent = 'label';
el.addEventListener('click', handler);
parent.appendChild(el);
```

### Adding a New Media Source
1. Add detection logic in `extractMediaLinks()` in `content/content.js`
2. Call `add(url, type, source)` — handles deduplication
3. Update `MutationObserver` `attributeFilter` if scanning new attributes

### Adding a New File Extension
1. Add to `IMAGE_EXT`, `VIDEO_EXT`, or `AUDIO_EXT` sets in `content/content.js`
2. Extend `classifyUrl()` only if special classification logic is needed

## Key Constraints
- Zero external dependencies — vanilla JS only
- No build step — files are loaded directly by Chrome
- Minimal permissions: `activeTab`, `scripting`, `downloads` — never request `<all_urls>`
- Guard double-injection: check `globalThis.__mediaLinkSaverInjected`
- IndexedDB cache TTL: 5 minutes, keyed by canonical URL (hash stripped)
- Download concurrency: `MAX_CONCURRENT = 4` in service worker

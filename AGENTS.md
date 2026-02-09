# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Media Link Saver is a Manifest V3 Chrome extension that scans webpages for media (images, videos, audio) and enables bulk downloading. It uses vanilla JavaScript with zero external dependencies and is fully CSP-compliant (no `innerHTML`, no inline event handlers).

## Testing and Development

### Loading the Extension
1. Navigate to `chrome://extensions/`
2. Enable Developer mode (top-right toggle)
3. Click "Load unpacked" and select the repository root directory
4. The extension will appear in the toolbar

### Testing Changes
- After editing code, click the reload icon on the extension card at `chrome://extensions/`
- For popup changes: close and reopen the popup
- For content script changes: reload the target webpage
- For service worker changes: the reload button handles it automatically

### Debugging
- **Popup**: Right-click extension icon → "Inspect popup"
- **Service worker**: Click "service worker" link on the extension card at `chrome://extensions/`
- **Content script**: Use the webpage's DevTools console (injected in the page context)

## Architecture

The extension uses a three-component message-passing architecture:

### 1. Popup (`popup/popup.js`, `popup.html`, `popup.css`)
- UI layer built entirely via DOM APIs (zero `innerHTML`)
- Manages filter state, search, hover previews, and download UI
- Communicates with service worker via `chrome.runtime.sendMessage()`
- Uses IndexedDB to cache scan results (5-minute TTL) for instant display on popup reopen
- All event handlers attached via `addEventListener()` for CSP compliance

### 2. Content Script (`content/content.js`)
- Injected on-demand via `chrome.scripting.executeScript()` when popup opens
- Scans DOM for media URLs from 15+ sources (see Media Detection Sources below)
- Uses `MutationObserver` to track dynamic page changes (SPAs, infinite scroll)
- Guards against double-injection with `globalThis.__mediaLinkSaverInjected`
- Responds to `getMedia` messages from popup with cached results
- Rescans on idle via `requestIdleCallback` when mutations occur

### 3. Service Worker (`background/service-worker.js`)
- Handles download orchestration with concurrency control (`MAX_CONCURRENT = 4`)
- Processes three message types: `download`, `downloadBlob`, `downloadAll`
- For blob URLs: injects script in `MAIN` world to fetch and convert to data URL
- Uses `Promise.allSettled()` for batched downloads with failure tracking

## Message Flow

```
Popup → Content Script: { action: 'getMedia' }
Content Script → Popup: { media: [...] }

Popup → Service Worker: { action: 'download', url, filename }
Service Worker → Popup: { success: bool, downloadId }

Popup → Service Worker: { action: 'downloadBlob', blobUrl, filename, tabId }
Service Worker → Content Script (MAIN world): fetch + readAsDataURL
Service Worker → Popup: { success: bool }

Popup → Service Worker: { action: 'downloadAll', items: [...] }
Service Worker → Popup: { success: bool, total, failed }
```

## Media Detection Sources

The content script scans these sources (in `extractMediaLinks()`):

1. **Direct elements**: `<img>`, `<video>`, `<audio>`, `<picture><source>`
2. **Lazy-load attributes**: `data-src`, `data-lazy`, `data-original`, `data-hi-res-src`, `data-srcset`
3. **Blob URLs**: Detected and resolved to real URLs via `data-*` attributes or parent `<a>` tags
4. **CSS backgrounds**: Inline `background-image: url(...)` styles
5. **Meta tags**: Open Graph (`og:image`, `og:video`) and Twitter Card metadata
6. **`<noscript>` fallbacks**: Parses hidden lazy-load fallback images
7. **`<link rel="preload">`**: Captures preloaded media hints
8. **JSON-LD structured data**: Extracts from `<script type="application/ld+json">`
9. **Iframe embeds**: Converts YouTube/Vimeo/Dailymotion embeds to native URLs
10. **Canvas snapshots**: Captures `<canvas>` as PNG data URLs (50-4096px range)
11. **Shadow DOM**: Recursively scans all shadow roots via `collectRoots()`
12. **Links**: `<a href>` pointing to media file extensions

## File Extension Classification

Defined at the top of `content/content.js`:
- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.avif`, `.tiff`
- **Videos**: `.mp4`, `.webm`, `.ogg`, `.mov`, `.avi`, `.mkv`, `.m4v`, `.flv`, `.wmv`
- **Audio**: `.mp3`, `.wav`, `.flac`, `.aac`, `.m4a`, `.wma`, `.opus`
- **Streams**: `.m3u8`, `.mpd` (HLS/DASH manifests)

## CSP Compliance Requirements

This extension enforces strict CSP: `script-src 'self'; object-src 'self'`

**When modifying code:**
- NEVER use `innerHTML` or `outerHTML` — use only `textContent`, `createElement()`, `appendChild()`
- NEVER use inline event handlers (`onclick`, `onload`) — use `addEventListener()` only
- NEVER use `eval()` or `new Function()`
- For parsing HTML snippets (e.g., `<noscript>`), use `<template>` element + `content` property

## Blob URL Handling

Blob URLs (generated by JavaScript, common on media sites) cannot be downloaded directly by the service worker because they exist only in the page's context. The resolution strategy:

1. Content script attempts to find a real URL via:
   - `data-*` attributes (`data-src`, `data-video-url`, `data-hd-url`, `data-file-url`)
   - Child `<source>` elements
   - Parent `<a href>` tag
2. If found, use the real URL (bypass blob entirely)
3. If not found, service worker injects a script in `MAIN` world to `fetch()` the blob and convert to data URL
4. Service worker then downloads the data URL

**See `resolveBlob()` in content script and `downloadBlob()` in service worker.**

## IndexedDB Caching Strategy

The popup caches scan results in IndexedDB (`MediaLinkSaverDB` / `mediaCache` store):

- **Key**: Canonical page URL (hash stripped)
- **TTL**: 5 minutes
- **Behavior**:
  - On popup open: show cached results instantly (if available)
  - Then: inject content script and fetch fresh results
  - Only re-render if fresh results differ from cached
- **Comparison**: Uses `mediaEqual()` to check URL and type equality

This ensures instant popup display on frequently visited pages while keeping data fresh.

## Common Patterns

### Adding a New Media Source
1. Add detection logic in `extractMediaLinks()` in `content/content.js`
2. Call `add(url, type, source)` for each found URL (handles deduplication automatically)
3. If source requires new attributes, add them to `attributeFilter` in the `MutationObserver` config

### Adding a New File Extension
1. Add to `IMAGE_EXT`, `VIDEO_EXT`, or `AUDIO_EXT` set at top of `content/content.js`
2. Extend `classifyUrl()` if special classification logic needed

### Modifying Download Behavior
- Single downloads: `downloadFile()` in `background/service-worker.js`
- Blob downloads: `downloadBlob()` (handles MAIN world injection)
- Batch downloads: `downloadAll()` (adjust `MAX_CONCURRENT` for concurrency)

### Adding UI Elements
1. Create elements in popup.js via `document.createElement()`
2. Set properties via `.textContent`, `.className`, `.disabled`, etc.
3. Attach event listeners via `.addEventListener()`
4. Append to DOM via `.appendChild()` or `.append()`
5. Style in `popup/popup.css`

## Manifest V3 Specifics

- **On-demand injection**: Content script injected via `chrome.scripting.executeScript()` only when popup opens (not declaratively)
- **Service worker**: Replaces persistent background page; must handle termination
- **Permissions**: `activeTab` (access current tab on click), `scripting` (inject content script), `downloads` (save files)
- **No host permissions**: Uses `activeTab` instead of `<all_urls>` for privacy

## Permissions Model

The extension uses minimal permissions:
- `activeTab`: Access page content only when user clicks icon
- `scripting`: Inject content script on demand
- `downloads`: Save files to downloads folder

No broad `<all_urls>` permission — access is opt-in per page via user interaction.

# Media Link Saver

> Chrome extension that finds every image, video, and audio file on any webpage and lets you save them with one click.

![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![LOC](https://img.shields.io/badge/LOC-~3%2C800-informational)

## Features

### 🔍 Media Detection
- **Deep scanning** — 15+ sources including `<img>`, `<video>`, `<audio>`, `<picture>`, CSS backgrounds, Open Graph / Twitter Card meta tags, JSON-LD structured data, `<noscript>` fallbacks, preload hints, iframe embeds, canvas snapshots, shadow DOM, schema.org microdata, inline script data, and Resource Timing API
- **Site-specific extraction** — YouTube thumbnails (maxresdefault + hqdefault), news site cover images, and CDN-aware poster-to-video derivation
- **Live sync** — MutationObserver keeps the media list updated as you scroll, with idle-time rescans for SPAs and infinite-scroll pages. Each shadow root gets its own observer
- **Smart filtering** — automatically excludes favicons, avatars, sprites, tracking pixels, placeholders, UI chrome, and other non-content assets (80×80 px minimum)
- **Resolution-aware dedup** — same image at different CDN sizes collapses to a single entry, keeping the highest resolution variant
- **Dimension & file size extraction** — reads natural width/height from image and video elements and file size from the Resource Timing API, displayed as badges on each item

### 🖼️ Popup UI
- **Grid & list views** — toggle between compact list and thumbnail grid layout
- **Filter by type** — All, Images, Videos, Audio — with live count badges that auto-hide empty categories
- **Search** — instantly filter results by filename or URL
- **Sort** — cycle through default, A–Z, and Z–A with a single click
- **Dimension filters** — minimum width/height inputs to hide small images (in collapsible Filters panel)
- **Per-item selection** — toggle Select mode to cherry-pick individual items with checkboxes, then Save Selected or Select All / Clear
- **Video thumbnails** — video items show a first-frame preview loaded via `<video preload="metadata">`, with emoji fallback for blob/embed URLs
- **Source pills** — each item shows where it was found (e.g. "youtube", "og/meta", "json-ld", "css bg")
- **Hover preview** — full-size image or auto-playing video preview on hover
- **Collapsible Filters panel** — advanced controls (dimension filters, format conversion, ZIP toggle, copy/export, selection helpers) are tucked behind a Filters button to keep the default view clean; open/closed state is remembered
- **Animated save feedback** — buttons transform to a green checkmark on success
- **Empty state** — friendly animated hint when no media is found
- **Glassmorphism header** — frosted backdrop-blur with sticky positioning
- **Virtual scrolling** — smooth performance with 500+ items via windowed rendering
- **Skeleton loading** — pulsing placeholder cards while scanning
- **Toast notifications** — slide-up success/error feedback with auto-dismiss

### 💾 Downloads
- **Save individually or in bulk** — download one file or Save All for everything matching your current filter
- **Save Selected** — download only the items you've checked in Select mode
- **Format conversion** — convert images to JPG or PNG on download (WebP → JPG/PNG via canvas in MAIN world); non-convertible items fall back to original format
- **ZIP packaging** — toggle ZIP mode to bundle all downloads into a single `.zip` file, built entirely in-browser with no external libraries
- **Live progress** — Save All button shows "Saving X/Y…" count during batch download
- **Retry failed** — partial failures surface a Retry button for just the items that didn't complete
- **Blob URL resolution** — fetches JavaScript-generated blobs in page context via `<a download>`, bypassing Chrome's data URL size limit
- **Concurrency control** — configurable parallel download limit (2–8)

### ⚡ Utilities
- **Copy URLs** — bulk-copy all visible media URLs to clipboard
- **Export CSV** — export filtered media list (filename, url, type) to clipboard
- **Keyboard shortcuts** — `Ctrl/Cmd+F` to focus search, `Ctrl/Cmd+Enter` to Save All
- **Context menu** — right-click any image for "Open image in new tab" or "Show in Media Link Saver" (auto-scrolls and highlights)
- **Instant popup** — IndexedDB caching (configurable TTL) displays cached results while a fresh scan runs in the background
- **Adaptive polling** — faster scans for the first 30 seconds, then relaxed interval

### ⚙️ Options
- **Cache TTL** — 1, 5, 15, or 30 minutes
- **Max concurrent downloads** — 2, 4, 6, or 8 parallel
- **Exclude patterns** — hide media matching URL substrings (one per line)

## Install

### Download (recommended)

1. Download the latest `.zip` from [Releases](https://github.com/BurntFrost/media-link-saver/releases)
2. Unzip the download
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

### From Source

```sh
git clone https://github.com/BurntFrost/media-link-saver.git
```

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the cloned folder

Visit any webpage and click the extension icon in the toolbar. 🎉

## Architecture

Three-component message-passing design:

```
┌─────────┐   getMedia    ┌────────────────┐
│  Popup  │ ────────────▸ │ Content Script  │
│ (DOM UI)│ ◂──────────── │  (DOM scanner)  │
└────┬────┘   media[]     └────────────────┘
     │
     │  download / downloadAll / downloadBlob
     │  downloadConverted / downloadZip
     ▾
┌─────────────────────────┐
│    Service Worker        │
│ (downloads, conversion, │
│  ZIP packaging)         │
└─────────────────────────┘
```

| Component | Files | Role |
|-----------|-------|------|
| **Popup** | `popup/popup.html` `popup.js` `popup.css` | UI layer — filters, search, sort, grid/list toggle, dimension filters, selection checkboxes, format conversion & ZIP controls, hover preview, download buttons. Built entirely via DOM APIs (zero innerHTML) |
| **Content Script** | `content/content.js` | Injected on demand. Deep-scans DOM for media across 15+ sources, extracts dimensions and file sizes, watches for mutations on document and shadow roots |
| **Service Worker** | `background/service-worker.js` | Download orchestration with configurable concurrency. Blob URLs resolved via MAIN world script injection. Format conversion (canvas-based) and ZIP packaging via MAIN world. Context menu registration |
| **Options** | `options/options.html` `options.js` `options.css` | User-configurable cache TTL, download concurrency, and URL exclude patterns |

## Media Detection Sources

| # | Source | What it scans |
|---|--------|---------------|
| 1 | Direct elements | `<img>`, `<video>`, `<audio>`, `<picture><source>` |
| 2 | Lazy-load attrs | `data-src`, `data-lazy`, `data-original`, `data-hi-res-src`, `data-srcset`, + 12 more |
| 3 | Blob URLs | Resolved via `data-*` attributes, child `<source>`, or parent `<a>` tags |
| 4 | CSS backgrounds | Inline `background-image: url(...)` on content elements |
| 5 | Meta tags | `og:image`, `og:video`, `twitter:image`, `twitter:player` |
| 6 | `<noscript>` fallbacks | Lazy-load fallback images parsed via `<template>` |
| 7 | Preload hints | `<link rel="preload">` media resources |
| 8 | JSON-LD | Recursive extraction from `<script type="application/ld+json">` structured data |
| 9 | Iframe embeds | YouTube, Vimeo, Dailymotion converted to native URLs |
| 10 | Canvas | `<canvas>` captured as PNG (50–4096 px range) |
| 11 | Shadow DOM | Recursive traversal of open and closed shadow roots via `chrome.dom.openOrClosedShadowRoot()`, with per-root mutation observers |
| 12 | Links | `<a href>` pointing to media file extensions |
| 13 | Schema.org microdata | `[itemprop="image"]`, `[itemprop="thumbnailUrl"]`, `[itemprop="contentUrl"]` |
| 14 | Inline scripts | Regex extraction from `ytInitialData`, `__NEXT_DATA__`, `__NUXT__`, Redux stores |
| 15 | Resource Timing API | `performance.getEntriesByType('resource')` catches media loaded by closed shadow DOM or frameworks |
| 16 | Poster derivation | Derives `.mp4` URLs from video poster images using CDN heuristics |

## Supported Formats

| Type | Extensions |
|------|-----------|
| **Images** | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` `.bmp` `.avif` `.tiff` `.tif` |
| **Videos** | `.mp4` `.webm` `.ogg` `.ogv` `.mov` `.avi` `.mkv` `.m4v` `.flv` `.wmv` |
| **Audio** | `.mp3` `.wav` `.flac` `.aac` `.m4a` `.wma` `.opus` `.oga` |
| **Streams** | `.m3u8` `.mpd` (HLS / DASH manifests) |

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Access page content only when the user clicks the extension icon |
| `scripting` | Inject content script on demand (no blanket `<all_urls>`) |
| `downloads` | Save files to the downloads folder |
| `storage` | Session storage for context-menu focus; IndexedDB cache; user options |
| `contextMenus` | Right-click image menu: "Open image in new tab" and "Show in Media Link Saver" |

## Project Structure

```
media-link-saver/
├── manifest.json
├── LICENSE
├── background/
│   └── service-worker.js    # Download orchestration & context menus
├── content/
│   └── content.js           # DOM scanning & mutation watching
├── popup/
│   ├── popup.html           # Minimal shell
│   ├── popup.js             # UI logic (100% DOM APIs)
│   └── popup.css            # Styles & animations
├── options/
│   ├── options.html          # Settings page
│   ├── options.js            # Cache TTL, concurrency, exclude patterns
│   └── options.css           # Options page styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    └── package.sh           # Build zip for distribution
```

## Design

- **Zero dependencies** — no build step, no bundler, loads directly into Chrome
- **CSP-compliant** — all DOM built via `createElement`, zero `innerHTML`
- **Memory-safe** — media list capped at 5,000 items; shadow roots cached incrementally
- **Accessible** — ARIA labels, live regions, keyboard-navigable, visible focus indicators
- **Apple HIG aesthetic** — system color tokens, 44 px touch targets, backdrop blur, smooth transitions

## License

MIT

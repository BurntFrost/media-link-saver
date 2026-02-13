# Media Link Saver

> Chrome extension that finds every image, video, and audio file on any webpage and lets you save them with one click.

![Chrome](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Deep media detection** — scans 12+ sources including `<img>`, `<video>`, `<audio>`, `<picture>`, CSS backgrounds, Open Graph / Twitter Card meta tags, JSON-LD structured data, `<noscript>` fallbacks, preload hints, iframe embeds, canvas snapshots, and shadow DOM
- **Live sync** — MutationObserver keeps the media list in sync as you scroll, with automatic idle-time rescans for SPAs and infinite-scroll pages. Each shadow root gets its own observer, so media injected into dynamically-created web components is caught immediately
- **Smart filtering** — excludes favicons, avatars, sprites, tracking pixels, and other non-content assets automatically
- **Resolution-aware dedup** — same image served at different CDN sizes (e.g. `?width=320` vs `?width=640`) collapses to a single entry, keeping the highest resolution variant
- **Filter by type** — toggle between All, Images, Videos, and Audio
- **Search** — instantly filter results by filename or URL
- **Sort** — order by name (A–Z or Z–A)
- **Hover preview** — see a full-size image or auto-playing video preview on hover
- **Truncated URLs** — long media URLs in the list show with ellipsis; full URL on hover
- **Context menu** — right-click any image for "Open image in new tab" or "Show in Media Link Saver"; the latter opens the popup and scrolls to that image with a brief highlight
- **Save individually or in bulk** — download a single file or hit Save All for everything matching your current filter. Partial failures re-enable Save All so you can retry, and only the items that actually succeeded are marked as saved
- **Blob URL resolution** — handles JavaScript-generated blob URLs by fetching the blob in the page context and downloading via `<a download>`, bypassing Chrome's data URL size limit so videos of any size work
- **Instant popup** — IndexedDB caching (5-minute TTL) displays cached results immediately while a fresh scan runs in the background
- **Skeleton loading** — smooth loading UI with skeleton cards while scanning
- **Toast notifications** — visual feedback on download success/failure
- **Memory-safe** — media list capped at 5,000 items to prevent unbounded growth on infinite-scroll pages; shadow roots cached incrementally to avoid full DOM re-walks
- **Lightweight** — zero external dependencies, fully CSP-compliant, no build step

## Install

### Download (recommended)

1. Download the latest `.zip` from [Releases](https://github.com/BurntFrost/media-link-saver/releases)
2. Unzip the download
3. Open Chrome → `chrome://extensions/`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

### From Source

1. Clone this repo:
   ```sh
   git clone https://github.com/BurntFrost/media-link-saver.git
   ```
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned folder

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
     ▾
┌──────────────┐
│Service Worker│
│ (downloads)  │
└──────────────┘
```

| Component | Files | Role |
|-----------|-------|------|
| **Popup** | `popup/popup.html` `popup.js` `popup.css` | UI layer — filter controls, search, sort, hover preview, download buttons. Built entirely via DOM APIs |
| **Content Script** | `content/content.js` | Injected on demand into the active tab. Scans DOM for media, watches for mutations via MutationObserver on `document.body` and each discovered shadow root |
| **Service Worker** | `background/service-worker.js` | Handles downloads with concurrency control (max 4 parallel). Blob URLs are resolved by injecting a MAIN world script that fetches the blob and triggers an `<a download>` click |

## Media Detection Sources

| # | Source | What it scans |
|---|--------|---------------|
| 1 | Direct elements | `<img>`, `<video>`, `<audio>`, `<picture><source>` |
| 2 | Lazy-load attrs | `data-src`, `data-lazy`, `data-original`, `data-hi-res-src`, `data-srcset` |
| 3 | Blob URLs | Resolved via `data-*` attributes, child `<source>`, or parent `<a>` tags |
| 4 | CSS backgrounds | Inline `background-image: url(...)` |
| 5 | Meta tags | `og:image`, `og:video`, `twitter:image`, `twitter:player` |
| 6 | `<noscript>` fallbacks | Lazy-load fallback images parsed via `<template>` |
| 7 | Preload hints | `<link rel="preload">` media resources |
| 8 | JSON-LD | `<script type="application/ld+json">` structured data |
| 9 | Iframe embeds | YouTube, Vimeo, Dailymotion converted to native URLs |
| 10 | Canvas | `<canvas>` captured as PNG (50–4096px range) |
| 11 | Shadow DOM | Recursively traverses all shadow roots (open and closed), with per-root mutation observers for SPA-injected components |
| 12 | Links | `<a href>` pointing to media file extensions |

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
| `storage` | Session storage for context-menu "Show in Media Link Saver" focus; IndexedDB cache uses the same permission |
| `contextMenus` | Right-click image menu: "Open image in new tab" and "Show in Media Link Saver" |

## Project Structure

```
media-link-saver/
├── manifest.json
├── LICENSE
├── background/
│   └── service-worker.js    # Download orchestration
├── content/
│   └── content.js           # DOM scanning & mutation watching
├── popup/
│   ├── popup.html            # Minimal shell
│   ├── popup.js              # UI logic (100% DOM APIs)
│   └── popup.css             # Styles
├── options/
│   ├── options.html
│   └── options.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    └── package.sh            # Build zip for distribution
```

## License

MIT

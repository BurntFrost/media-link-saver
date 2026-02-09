# Media Link Saver

Chrome extension that scans any webpage for photos and videos and lets you save them with one click.

## Features

- **Auto-detects media** — finds images and videos from `<img>`, `<video>`, `<picture>`, `<source>`, `<a>` links, CSS backgrounds, and Open Graph / Twitter Card meta tags
- **Hover preview** — hover over any item to see a full-size image or auto-playing video preview
- **Filter by type** — toggle between All, Images, and Videos
- **Save individually or in bulk** — download a single file or hit Save All for everything in the current filter
- **SPA-friendly** — MutationObserver keeps the media list up to date on dynamic pages and infinite scroll
- **Lightweight** — no external dependencies, built with Manifest V3 and fully CSP-compliant

## Install

1. Clone this repo:
   ```sh
   git clone https://github.com/BurntFrost/media-link-saver.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the cloned `media-link-saver` folder
5. Visit any webpage and click the extension icon in the toolbar

## How it works

| Component | File | Role |
|---|---|---|
| **Popup** | `popup/popup.html` `popup/popup.js` `popup/popup.css` | UI shell — builds the media list, filter controls, hover preview, and download buttons entirely via DOM APIs |
| **Content script** | `content/content.js` | Injected on demand into the active tab. Scans the DOM for media URLs and watches for mutations |
| **Service worker** | `background/service-worker.js` | Handles download requests from the popup with concurrency-limited batching |

## Detected media sources

| Source | Elements / attributes scanned |
|---|---|
| Links | `<a href="...">` pointing to media file extensions |
| Images | `<img src>`, `<img srcset>`, `<picture><source srcset>` |
| Video | `<video src>`, `<video><source src>`, `<video poster>` |
| CSS | Inline `background-image: url(...)` |
| Meta tags | `og:image`, `og:video`, `twitter:image`, `twitter:player` |

## Supported formats

- **Images:** `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` `.bmp` `.ico` `.avif` `.tiff`
- **Videos:** `.mp4` `.webm` `.ogg` `.mov` `.avi` `.mkv` `.m4v` `.flv` `.wmv`

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Access the current tab's page content when the popup is opened |
| `scripting` | Inject the content script on demand (no blanket `<all_urls>` injection) |
| `downloads` | Save files to the user's downloads folder |

## Project structure

```
media-link-saver/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   └── content.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## License

MIT

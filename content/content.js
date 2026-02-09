// Media Link Saver — Content Script
// Injected on demand via chrome.scripting.executeScript().
// Uses a guard to prevent double-injection.

if (!globalThis.__mediaLinkSaverInjected) {
  globalThis.__mediaLinkSaverInjected = true;

  const IMAGE_EXT = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.tiff', '.tif'
  ]);

  const VIDEO_EXT = new Set([
    '.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'
  ]);

  const TRACKING_RE = /\/pixel[./?]|\/tr[./?]|1x1|spacer/i;
  const BG_URL_RE = /url\(["']?(.+?)["']?\)/;

  function getExtension(url) {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      const dot = pathname.lastIndexOf('.');
      if (dot === -1) return '';
      return pathname.slice(dot).split(/[?#]/)[0];
    } catch {
      return '';
    }
  }

  function classifyUrl(url) {
    const ext = getExtension(url);
    if (IMAGE_EXT.has(ext)) return 'image';
    if (VIDEO_EXT.has(ext)) return 'video';
    return null;
  }

  function parseSrcset(srcset) {
    const urls = [];
    for (const entry of srcset.split(',')) {
      const url = entry.trimStart().split(/\s/, 1)[0];
      if (url) urls.push(url);
    }
    return urls;
  }

  function extractMediaLinks() {
    const seen = new Set();
    const media = [];

    const add = (url, type, source) => {
      if (!url || seen.has(url)) return;
      if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('javascript:')) return;
      if (TRACKING_RE.test(url)) return;
      seen.add(url);
      media.push({ url, type, source });
    };

    for (const a of document.querySelectorAll('a[href]')) {
      const type = classifyUrl(a.href);
      if (type) add(a.href, type, 'link');
    }

    for (const img of document.querySelectorAll('img')) {
      if (img.currentSrc) add(img.currentSrc, 'image', 'img');
      else if (img.src) add(img.src, 'image', 'img');
      if (img.srcset) {
        for (const url of parseSrcset(img.srcset)) add(url, 'image', 'img-srcset');
      }
    }

    for (const video of document.querySelectorAll('video')) {
      if (video.src) add(video.src, 'video', 'video');
      if (video.poster) add(video.poster, 'image', 'video-poster');
    }
    for (const src of document.querySelectorAll('video source, audio source')) {
      if (src.src) {
        const type = src.type?.startsWith('video') ? 'video' : classifyUrl(src.src);
        if (type) add(src.src, type, 'source');
      }
    }

    for (const src of document.querySelectorAll('picture source')) {
      if (src.srcset) {
        for (const url of parseSrcset(src.srcset)) add(url, 'image', 'picture-source');
      }
    }

    for (const el of document.querySelectorAll('[style*="background"]')) {
      const match = el.style.backgroundImage?.match(BG_URL_RE);
      if (match?.[1]) {
        try {
          const url = new URL(match[1], location.href).href;
          add(url, classifyUrl(url) ?? 'image', 'css-bg');
        } catch { /* skip */ }
      }
    }

    for (const meta of document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')) {
      const prop = meta.getAttribute('property') || meta.getAttribute('name') || '';
      const content = meta.getAttribute('content');
      if (!content) continue;
      if (/image/i.test(prop)) add(content, 'image', 'meta');
      if (/video/i.test(prop)) add(content, 'video', 'meta');
    }

    return media;
  }

  // ── Live updates via MutationObserver ──

  let cachedMedia = extractMediaLinks();
  let scanQueued = false;

  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    const schedule = globalThis.requestIdleCallback ?? ((cb) => setTimeout(cb, 80));
    schedule(() => {
      scanQueued = false;
      cachedMedia = extractMediaLinks();
    });
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributeFilter: ['src', 'srcset', 'href', 'poster', 'style'],
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getMedia') {
      sendResponse({ media: cachedMedia });
    }
    return true;
  });
}

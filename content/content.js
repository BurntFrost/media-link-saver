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

  const AUDIO_EXT = new Set([
    '.mp3', '.wav', '.flac', '.aac', '.m4a', '.wma', '.opus', '.oga'
  ]);

  const STREAM_EXT = new Set(['.m3u8', '.mpd']);

  const MEDIA_DATA_ATTRS = ['data-src', 'data-video-url', 'data-hd-url', 'data-file-url'];
  const LAZY_ATTRS = ['data-src', 'data-lazy', 'data-original', 'data-lazy-src', 'data-hi-res-src'];

  const TRACKING_RE = /\/pixel[./?]|\/tr[./?]|1x1|spacer/i;
  const BG_URL_RE = /url\(["']?(.+?)["']?\)/;

  // ~750 bytes of real content — filters tracking pixels and tiny placeholders
  const DATA_URI_MIN_LENGTH = 1000;
  const MIN_CANVAS_SIZE = 50;
  const MAX_CANVAS_SIZE = 4096;

  const EMBED_PATTERNS = [
    { re: /youtube\.com\/embed\/([a-zA-Z0-9_-]+)/, url: (id) => `https://www.youtube.com/watch?v=${id}` },
    { re: /youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]+)/, url: (id) => `https://www.youtube.com/watch?v=${id}` },
    { re: /player\.vimeo\.com\/video\/(\d+)/, url: (id) => `https://vimeo.com/${id}` },
    { re: /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/, url: (id) => `https://www.dailymotion.com/video/${id}` },
  ];

  const JSON_LD_MEDIA_KEYS = new Set([
    'image', 'thumbnailUrl', 'contentUrl', 'embedUrl',
    'logo', 'photo', 'video', 'audio',
  ]);

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
    if (VIDEO_EXT.has(ext) || STREAM_EXT.has(ext)) return 'video';
    if (AUDIO_EXT.has(ext)) return 'audio';
    return null;
  }

  function isStreamUrl(url) {
    return STREAM_EXT.has(getExtension(url));
  }

  function parseSrcset(srcset) {
    const urls = [];
    for (const entry of srcset.split(',')) {
      const url = entry.trimStart().split(/\s/, 1)[0];
      if (url) urls.push(url);
    }
    return urls;
  }

  // ── Shadow DOM traversal ──

  function collectRoots() {
    const roots = [document];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          roots.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    return roots;
  }

  function deepQuerySelectorAll(roots, selector) {
    const results = [];
    for (const root of roots) {
      results.push(...root.querySelectorAll(selector));
    }
    return results;
  }

  // ── JSON-LD media extraction ──

  function extractJsonLdMedia(obj, addFn) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) extractJsonLdMedia(item, addFn);
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && JSON_LD_MEDIA_KEYS.has(key)) {
        try {
          const url = new URL(val, location.href).href;
          const type = classifyUrl(url);
          if (type) addFn(url, type, 'json-ld');
        } catch { /* skip */ }
      } else if (typeof val === 'object') {
        extractJsonLdMedia(val, addFn);
      }
    }
  }

  // ── Blob URL resolution ──

  function resolveBlob(element) {
    for (const attr of MEDIA_DATA_ATTRS) {
      const val = element.getAttribute(attr);
      if (val && !val.startsWith('blob:') && !val.startsWith('data:')) {
        try { return new URL(val, location.href).href; } catch { /* skip */ }
      }
    }

    for (const src of element.querySelectorAll('source')) {
      if (src.src && !src.src.startsWith('blob:')) return src.src;
    }

    const anchor = element.closest('a[href]');
    if (anchor) {
      const type = classifyUrl(anchor.href);
      if (type) return anchor.href;
    }

    return null;
  }

  // ── Main extraction ──

  function extractMediaLinks() {
    const seen = new Set();
    const media = [];
    const roots = collectRoots();
    const deep = (sel) => deepQuerySelectorAll(roots, sel);

    const add = (url, type, source, blob = false) => {
      if (!url || seen.has(url)) return;
      if (url.startsWith('javascript:')) return;
      // Allow large data: URIs (actual content), skip small ones (tracking pixels)
      if (url.startsWith('data:')) {
        if (url.length < DATA_URI_MIN_LENGTH) return;
      }
      if (!blob && !url.startsWith('data:') && TRACKING_RE.test(url)) return;
      seen.add(url);
      const item = { url, type, source };
      if (blob) item.blob = true;
      if (isStreamUrl(url)) item.stream = true;
      media.push(item);
    };

    const addBlob = (element, blobUrl, type, source) => {
      const realUrl = resolveBlob(element);
      if (realUrl) {
        add(realUrl, type, source);
      } else {
        add(blobUrl, type, source, true);
      }
    };

    // Links
    for (const a of deep('a[href]')) {
      const type = classifyUrl(a.href);
      if (type) add(a.href, type, 'link');
    }

    // Images (including lazy-loaded)
    for (const img of deep('img')) {
      const imgSrc = img.currentSrc || img.src;
      if (imgSrc) {
        if (imgSrc.startsWith('blob:')) addBlob(img, imgSrc, 'image', 'img');
        else add(imgSrc, 'image', 'img');
      }
      if (img.srcset) {
        for (const url of parseSrcset(img.srcset)) add(url, 'image', 'img-srcset');
      }
      // Lazy-load attributes
      for (const attr of LAZY_ATTRS) {
        const val = img.getAttribute(attr);
        if (val && !val.startsWith('blob:') && !val.startsWith('data:')) {
          try { add(new URL(val, location.href).href, 'image', 'lazy'); } catch { /* skip */ }
        }
      }
      const lazySrcset = img.getAttribute('data-srcset');
      if (lazySrcset) {
        for (const url of parseSrcset(lazySrcset)) {
          try { add(new URL(url, location.href).href, 'image', 'lazy-srcset'); } catch { /* skip */ }
        }
      }
    }

    // Videos
    for (const video of deep('video')) {
      if (video.src) {
        if (video.src.startsWith('blob:')) addBlob(video, video.src, 'video', 'video');
        else add(video.src, 'video', 'video');
      }
      if (video.poster) add(video.poster, 'image', 'video-poster');
    }
    for (const src of deep('video source, audio source')) {
      if (src.src) {
        if (src.src.startsWith('blob:')) {
          const parent = src.closest('video') || src.closest('audio') || src.parentElement;
          const blobType = src.closest('audio') ? 'audio' : 'video';
          addBlob(parent, src.src, blobType, 'source');
        } else {
          const type = src.type?.startsWith('audio')
            ? 'audio'
            : src.type?.startsWith('video')
              ? 'video'
              : classifyUrl(src.src);
          if (type) add(src.src, type, 'source');
        }
      }
    }

    // Audio elements
    for (const audio of deep('audio')) {
      if (audio.src) {
        if (audio.src.startsWith('blob:')) addBlob(audio, audio.src, 'audio', 'audio');
        else add(audio.src, 'audio', 'audio');
      }
    }

    // Picture sources
    for (const src of deep('picture source')) {
      if (src.srcset) {
        for (const url of parseSrcset(src.srcset)) add(url, 'image', 'picture-source');
      }
    }

    // CSS backgrounds
    for (const el of deep('[style*="background"]')) {
      const match = el.style.backgroundImage?.match(BG_URL_RE);
      if (match?.[1]) {
        try {
          const url = new URL(match[1], location.href).href;
          add(url, classifyUrl(url) ?? 'image', 'css-bg');
        } catch { /* skip */ }
      }
    }

    // Open Graph / Twitter meta
    for (const meta of document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')) {
      const prop = meta.getAttribute('property') || meta.getAttribute('name') || '';
      const content = meta.getAttribute('content');
      if (!content) continue;
      if (/image/i.test(prop)) add(content, 'image', 'meta');
      if (/video/i.test(prop)) add(content, 'video', 'meta');
      if (/audio/i.test(prop)) add(content, 'audio', 'meta');
    }

    // <noscript> fallback images (lazy-load libraries hide real <img> here)
    for (const noscript of document.querySelectorAll('noscript')) {
      const tpl = document.createElement('template');
      tpl.innerHTML = noscript.textContent;
      for (const img of tpl.content.querySelectorAll('img[src]')) {
        try {
          add(new URL(img.getAttribute('src'), location.href).href, 'image', 'noscript');
        } catch { /* skip */ }
      }
    }

    // <link rel="preload"> media hints
    for (const link of document.querySelectorAll('link[rel="preload"]')) {
      const href = link.href;
      const as = link.getAttribute('as');
      if (!href) continue;
      if (as === 'image') add(href, 'image', 'preload');
      else if (as === 'video') add(href, 'video', 'preload');
      else if (as === 'audio') add(href, 'audio', 'preload');
    }

    // JSON-LD structured data
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        extractJsonLdMedia(JSON.parse(script.textContent), add);
      } catch { /* skip malformed JSON */ }
    }

    // Iframe video embeds (YouTube, Vimeo, Dailymotion)
    for (const iframe of deep('iframe[src]')) {
      const src = iframe.src;
      for (const { re, url } of EMBED_PATTERNS) {
        const match = src.match(re);
        if (match) {
          const embedUrl = url(match[1]);
          if (!seen.has(embedUrl)) {
            seen.add(embedUrl);
            media.push({ url: embedUrl, type: 'video', source: 'embed', embed: true });
          }
          break;
        }
      }
    }

    // Canvas snapshots (skip tiny or huge canvases)
    for (const canvas of deep('canvas')) {
      if (canvas.width < MIN_CANVAS_SIZE || canvas.height < MIN_CANVAS_SIZE) continue;
      if (canvas.width > MAX_CANVAS_SIZE || canvas.height > MAX_CANVAS_SIZE) continue;
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.length > DATA_URI_MIN_LENGTH) {
          add(dataUrl, 'image', 'canvas');
        }
      } catch { /* tainted canvas — skip */ }
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
      attributeFilter: [
        'src', 'srcset', 'href', 'poster', 'style',
        'data-src', 'data-lazy', 'data-original', 'data-lazy-src', 'data-hi-res-src',
      ],
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getMedia') {
      sendResponse({ media: cachedMedia });
    }
    return true;
  });
}

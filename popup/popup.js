// Media Link Saver — Popup Script
// All UI is built programmatically. Zero innerHTML. Zero inline handlers.

// ── Build static shell ──

const app = document.getElementById('app');

// Header
const header = document.createElement('header');
const h1 = document.createElement('h1');
h1.textContent = 'Media Link Saver';
const summary = document.createElement('div');
summary.id = 'summary';
header.append(h1, summary);

// Controls
const controls = document.createElement('div');
controls.id = 'controls';

const filterRow = document.createElement('div');
filterRow.className = 'filter-row';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
];
const filterBtns = filters.map(({ key, label }) => {
  const btn = document.createElement('button');
  btn.className = 'filter-btn' + (key === 'all' ? ' active' : '');
  btn.dataset.filter = key;
  btn.textContent = label;
  return btn;
});
filterRow.append(...filterBtns);

const searchInput = document.createElement('input');
searchInput.id = 'search-input';
searchInput.type = 'text';
searchInput.placeholder = 'Search media\u2026';

const saveAllBtn = document.createElement('button');
saveAllBtn.id = 'save-all-btn';
saveAllBtn.disabled = true;
saveAllBtn.textContent = 'Save All';
controls.append(filterRow, searchInput, saveAllBtn);

// Media list
const mediaListEl = document.createElement('div');
mediaListEl.id = 'media-list';

// Empty state
const emptyStateEl = document.createElement('div');
emptyStateEl.id = 'empty-state';
emptyStateEl.className = 'hidden';
const emptyP = document.createElement('p');
emptyP.textContent = 'No media links found on this page.';
emptyStateEl.appendChild(emptyP);

// Loading
const loadingEl = document.createElement('div');
loadingEl.id = 'loading';
loadingEl.textContent = 'Scanning page\u2026';

// Preview overlay
const previewOverlay = document.createElement('div');
previewOverlay.id = 'preview-overlay';

app.append(header, controls, mediaListEl, emptyStateEl, loadingEl, previewOverlay);

// ── State ──

let allMedia = [];
let currentFilter = 'all';
let searchQuery = '';

// ── Helpers ──

function filenameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? 'file').slice(0, 80);
  } catch {
    return 'file';
  }
}

function truncateUrl(url, max = 50) {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max) + '\u2026' : display;
  } catch {
    return url.slice(0, max);
  }
}

function getFiltered() {
  let items = currentFilter === 'all'
    ? allMedia
    : allMedia.filter((m) => m.type === currentFilter);

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter((m) =>
      m.url.toLowerCase().includes(q) ||
      filenameFromUrl(m.url).toLowerCase().includes(q)
    );
  }

  return items;
}

function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

// ── Build a single media-item DOM node ──

function createMediaItem(item, index) {
  const row = document.createElement('div');
  row.className = 'media-item';
  row.dataset.index = index;

  // Thumbnail
  if (item.type === 'image') {
    const img = document.createElement('img');
    img.className = 'media-thumb';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.src = item.url;
    img.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'media-thumb placeholder';
      ph.textContent = '\uD83D\uDDBC\uFE0F';
      img.replaceWith(ph);
    }, { once: true });
    row.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'media-thumb placeholder';
    ph.textContent = '\uD83C\uDFA5';
    row.appendChild(ph);
  }

  // Info
  const info = document.createElement('div');
  info.className = 'media-info';

  const filename = filenameFromUrl(item.url);

  const fnEl = document.createElement('div');
  fnEl.className = 'media-filename';
  fnEl.textContent = filename;
  fnEl.title = filename;

  const meta = document.createElement('div');
  meta.className = 'media-meta';

  const badge = document.createElement('span');
  badge.className = 'media-type-badge ' + item.type;
  badge.textContent = item.type;

  const urlLabel = document.createElement('span');
  urlLabel.textContent = truncateUrl(item.url);
  urlLabel.title = item.url;

  meta.append(badge, urlLabel);
  info.append(fnEl, meta);
  row.appendChild(info);

  // Save button
  const btn = document.createElement('button');
  btn.className = 'save-btn';
  btn.textContent = 'Save';
  btn.dataset.url = item.url;
  btn.dataset.filename = filename;
  row.appendChild(btn);

  return row;
}

// ── Rendering ──

function renderMedia(mediaItems) {
  const filtered = getFiltered();

  if (filtered.length === 0) {
    mediaListEl.replaceChildren();
    emptyStateEl.classList.remove('hidden');
    saveAllBtn.disabled = true;
    return;
  }

  emptyStateEl.classList.add('hidden');
  saveAllBtn.disabled = false;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < filtered.length; i++) {
    fragment.appendChild(createMediaItem(filtered[i], i));
  }
  mediaListEl.replaceChildren(fragment);

  const images = mediaItems.filter((m) => m.type === 'image').length;
  const videos = mediaItems.filter((m) => m.type === 'video').length;
  summary.textContent = 'Found ' + images + ' image' + (images !== 1 ? 's' : '') +
    ' and ' + videos + ' video' + (videos !== 1 ? 's' : '');
}

// ── Event Handlers ──

mediaListEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.save-btn');
  if (!btn || btn.classList.contains('saved')) return;

  btn.textContent = '\u2026';
  const response = await sendMsg({
    action: 'download',
    url: btn.dataset.url,
    filename: btn.dataset.filename,
  });

  if (response?.success) {
    btn.textContent = 'Saved';
    btn.classList.add('saved');
  } else {
    btn.textContent = 'Error';
    setTimeout(() => { btn.textContent = 'Save'; }, 2000);
  }
});

saveAllBtn.addEventListener('click', async () => {
  const items = getFiltered().map((m) => ({
    url: m.url,
    filename: filenameFromUrl(m.url),
  }));

  saveAllBtn.textContent = 'Saving\u2026';
  saveAllBtn.disabled = true;

  const response = await sendMsg({ action: 'downloadAll', items });

  if (response?.success) {
    saveAllBtn.textContent = 'Saved ' + (response.total - response.failed) + '/' + response.total;
    for (const btn of mediaListEl.querySelectorAll('.save-btn:not(.saved)')) {
      btn.textContent = 'Saved';
      btn.classList.add('saved');
    }
  } else {
    saveAllBtn.textContent = 'Save All';
    saveAllBtn.disabled = false;
  }
});

for (const btn of filterBtns) {
  btn.addEventListener('click', () => {
    for (const b of filterBtns) b.classList.remove('active');
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderMedia(allMedia);
  });
}

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderMedia(allMedia);
});

// ── Hover Preview ──

let activePreviewItem = null;
let hoverTimer = null;
let previewAbort = null;
const HOVER_DELAY_MS = 350;

function showPreview(mediaItem, itemEl) {
  previewAbort?.abort();
  previewAbort = new AbortController();
  const { signal } = previewAbort;

  previewOverlay.replaceChildren();

  if (mediaItem.type === 'image') {
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.decoding = 'async';
    img.src = mediaItem.url;
    previewOverlay.appendChild(img);

    if (img.decode) {
      img.decode().then(() => {
        if (!signal.aborted) {
          requestAnimationFrame(() => previewOverlay.classList.add('visible'));
        }
      }).catch(() => {
        if (!signal.aborted) previewOverlay.classList.add('visible');
      });
    } else {
      requestAnimationFrame(() => {
        if (!signal.aborted) previewOverlay.classList.add('visible');
      });
    }
  } else {
    const video = document.createElement('video');
    video.src = mediaItem.url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    previewOverlay.appendChild(video);

    requestAnimationFrame(() => {
      if (!signal.aborted) previewOverlay.classList.add('visible');
    });
  }

  itemEl.classList.add('previewing');
  activePreviewItem = itemEl;
}

function hidePreview() {
  previewAbort?.abort();
  previewOverlay.classList.remove('visible');

  if (activePreviewItem) {
    activePreviewItem.classList.remove('previewing');
    activePreviewItem = null;
  }

  previewOverlay.addEventListener('transitionend', () => {
    if (!previewOverlay.classList.contains('visible')) {
      const video = previewOverlay.querySelector('video');
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      previewOverlay.replaceChildren();
    }
  }, { once: true });
}

function cancelPendingPreview() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

mediaListEl.addEventListener('mouseenter', (e) => {
  const item = e.target.closest('.media-item');
  if (!item) return;

  // Dismiss preview when entering save button
  if (e.target.closest('.save-btn')) {
    cancelPendingPreview();
    hidePreview();
    return;
  }

  cancelPendingPreview();
  hoverTimer = setTimeout(() => {
    const idx = parseInt(item.dataset.index, 10);
    const mediaItem = getFiltered()[idx];
    if (mediaItem) showPreview(mediaItem, item);
  }, HOVER_DELAY_MS);
}, true);

mediaListEl.addEventListener('mouseleave', (e) => {
  const item = e.target.closest('.media-item');
  if (!item) return;

  // Only dismiss when truly leaving the row (relatedTarget is outside this item)
  const goingTo = e.relatedTarget;
  if (goingTo && item.contains(goingTo) && !goingTo.closest('.save-btn')) return;

  cancelPendingPreview();
  hidePreview();
}, true);

// ── IndexedDB Cache ──

const CACHE_DB_NAME = 'MediaLinkSaverDB';
const CACHE_STORE = 'mediaCache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CACHE_STORE, { keyPath: 'pageUrl' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedMedia(pageUrl) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(pageUrl);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedMedia(pageUrl, media) {
  try {
    const db = await openCacheDB();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put({ pageUrl, media, timestamp: Date.now() });
  } catch {
    // Cache write failure is non-critical
  }
}

// ── Init: inject content script on demand, then fetch media ──

function liveScan(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'getMedia' }, (response) => {
      if (chrome.runtime.lastError || !response?.media) {
        resolve(null);
      } else {
        resolve(response.media);
      }
    });
  });
}

function mediaEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].url !== b[i].url || a[i].type !== b[i].type) return false;
  }
  return true;
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');

    const pageUrl = canonicalUrl(tab.url);
    const cached = await getCachedMedia(pageUrl);
    const isFresh = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS);

    if (cached) {
      // Show cached results immediately
      loadingEl.classList.add('hidden');
      allMedia = cached.media;
      renderMedia(allMedia);
    }

    // Inject the content script into the active tab (idempotent — won't double-inject)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js'],
    });

    const freshMedia = await liveScan(tab.id);
    loadingEl.classList.add('hidden');

    if (freshMedia) {
      await setCachedMedia(pageUrl, freshMedia);

      // Only re-render if results differ from what's displayed
      if (!cached || !mediaEqual(allMedia, freshMedia)) {
        allMedia = freshMedia;
        renderMedia(allMedia);
      }
    } else if (!cached) {
      emptyStateEl.classList.remove('hidden');
      summary.textContent = 'Could not scan this page';
    }
  } catch {
    loadingEl.classList.add('hidden');
    if (!allMedia.length) emptyStateEl.classList.remove('hidden');
  }
}

init();

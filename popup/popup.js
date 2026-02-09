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
  { key: 'audio', label: 'Audio' },
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
const sortSelect = document.createElement('select');
sortSelect.id = 'sort-select';
for (const [value, label] of [
  ['default', 'Default'],
  ['name-asc', 'Name A\u2013Z'],
  ['name-desc', 'Name Z\u2013A'],
]) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  sortSelect.appendChild(opt);
}

const controlsRow = document.createElement('div');
controlsRow.className = 'controls-row';
controlsRow.append(filterRow, sortSelect, saveAllBtn);
controls.append(searchInput, controlsRow);

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

// Loading (skeleton cards)
const loadingEl = document.createElement('div');
loadingEl.id = 'loading';
for (let i = 0; i < 4; i++) {
  const skel = document.createElement('div');
  skel.className = 'skeleton-item';
  const thumb = document.createElement('div');
  thumb.className = 'skeleton-thumb';
  const info = document.createElement('div');
  info.className = 'skeleton-info';
  const line1 = document.createElement('div');
  line1.className = 'skeleton-line';
  const line2 = document.createElement('div');
  line2.className = 'skeleton-line short';
  info.append(line1, line2);
  skel.append(thumb, info);
  loadingEl.appendChild(skel);
}

// Preview overlay
const previewOverlay = document.createElement('div');
previewOverlay.id = 'preview-overlay';

// Toast notification
const toastEl = document.createElement('div');
toastEl.id = 'toast';

app.append(header, controls, mediaListEl, emptyStateEl, loadingEl, previewOverlay, toastEl);

// ── State ──

let allMedia = [];
let currentFilter = 'all';
let currentSort = 'default';
let searchQuery = '';
let activeTabId = null;
let activePageUrl = null;
const savedUrls = new Set();

// ── Helpers ──

function filenameFromUrl(url) {
  try {
    if (url.startsWith('data:')) {
      const mime = url.match(/^data:([^;,]+)/)?.[1] ?? '';
      const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin';
      return `data.${ext}`;
    }
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? 'file').slice(0, 80);
  } catch {
    return 'file';
  }
}

function truncateUrl(url, max = 50) {
  try {
    if (url.startsWith('data:')) {
      const prefix = url.slice(0, url.indexOf(','));
      return prefix.length > max ? prefix.slice(0, max) + '\u2026' : prefix;
    }
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

  if (currentSort === 'name-asc') {
    items = [...items].sort((a, b) => filenameFromUrl(a.url).localeCompare(filenameFromUrl(b.url)));
  } else if (currentSort === 'name-desc') {
    items = [...items].sort((a, b) => filenameFromUrl(b.url).localeCompare(filenameFromUrl(a.url)));
  }

  return items;
}

function deduplicateMedia(items) {
  const seenUrls = new Set();
  const seenNames = new Set();
  return items.filter((item) => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    const name = filenameFromUrl(item.url);
    if (seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  });
}

function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

let toastTimer = null;
function showToast(text, type = 'success') {
  clearTimeout(toastTimer);
  toastEl.textContent = text;
  toastEl.className = 'visible ' + type;
  toastTimer = setTimeout(() => { toastEl.className = ''; }, 2500);
}

// ── Build a single media-item DOM node ──

function createMediaItem(item, index) {
  const row = document.createElement('div');
  row.className = 'media-item';
  row.dataset.index = index;
  row.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

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
    ph.textContent = item.type === 'audio' ? '\uD83C\uDFB5' : '\uD83C\uDFA5';
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

  meta.append(badge);

  const extraBadges = [
    item.blob && 'blob',
    item.stream && 'stream',
    item.embed && 'embed',
  ].filter(Boolean);
  for (const key of extraBadges) {
    const b = document.createElement('span');
    b.className = 'media-type-badge ' + key;
    b.textContent = key;
    meta.append(b);
  }

  const urlLabel = document.createElement('span');
  urlLabel.textContent = truncateUrl(item.url);
  urlLabel.title = item.url;

  meta.append(urlLabel);
  info.append(fnEl, meta);
  row.appendChild(info);

  // Action buttons
  if (item.embed) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.dataset.url = item.url;
    row.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'save-btn';
    btn.dataset.url = item.url;
    btn.dataset.filename = filename;
    if (item.blob) btn.dataset.blob = 'true';
    if (savedUrls.has(item.url)) {
      btn.textContent = 'Saved';
      btn.classList.add('saved');
    } else {
      btn.textContent = 'Save';
    }
    row.appendChild(btn);
  }

  return row;
}

// ── Rendering ──

function renderMedia(mediaItems, animate = false) {
  // Show/hide filter tabs based on available types
  const typeCounts = { image: 0, video: 0, audio: 0 };
  for (const item of allMedia) {
    if (item.type in typeCounts) typeCounts[item.type]++;
  }
  for (const btn of filterBtns) {
    const key = btn.dataset.filter;
    if (key === 'all') continue;
    btn.classList.toggle('hidden', typeCounts[key] === 0);
  }
  // Reset to 'all' if active filter has no results
  if (currentFilter !== 'all' && typeCounts[currentFilter] === 0) {
    currentFilter = 'all';
    for (const b of filterBtns) b.classList.remove('active');
    filterBtns[0].classList.add('active');
  }

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

  mediaListEl.classList.toggle('animate-items', animate);
  mediaListEl.replaceChildren(fragment);

  const images = mediaItems.filter((m) => m.type === 'image').length;
  const videos = mediaItems.filter((m) => m.type === 'video').length;
  const audios = mediaItems.filter((m) => m.type === 'audio').length;
  let text = 'Found ' + images + ' image' + (images !== 1 ? 's' : '') +
    ', ' + videos + ' video' + (videos !== 1 ? 's' : '');
  if (audios > 0) text += ', ' + audios + ' audio';
  summary.textContent = text;
}

// ── Event Handlers ──

mediaListEl.addEventListener('click', async (e) => {
  // Copy URL for embed items
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.url);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('saved');
      showToast('URL copied to clipboard', 'info');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('saved'); }, 2000);
    } catch {
      copyBtn.textContent = 'Failed';
      showToast('Failed to copy', 'error');
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    }
    return;
  }

  const btn = e.target.closest('.save-btn');
  if (!btn || btn.classList.contains('saved')) return;

  btn.textContent = '\u2026';

  const isBlob = btn.dataset.blob === 'true';
  const response = isBlob
    ? await sendMsg({
        action: 'downloadBlob',
        blobUrl: btn.dataset.url,
        filename: btn.dataset.filename,
        tabId: activeTabId,
      })
    : await sendMsg({
        action: 'download',
        url: btn.dataset.url,
        filename: btn.dataset.filename,
      });

  if (response?.success) {
    btn.textContent = 'Saved';
    btn.classList.add('saved');
    savedUrls.add(btn.dataset.url);
  } else {
    btn.textContent = 'Error';
    btn.title = response?.error || 'Download failed';
    showToast(response?.error || 'Download failed', 'error');
    setTimeout(() => { btn.textContent = 'Save'; btn.title = ''; }, 2000);
  }
});

saveAllBtn.addEventListener('click', async () => {
  const items = getFiltered()
    .filter((m) => !m.embed)
    .map((m) => ({
      url: m.url,
      filename: filenameFromUrl(m.url),
      blob: !!m.blob,
      tabId: activeTabId,
    }));

  saveAllBtn.textContent = 'Saving\u2026';
  saveAllBtn.disabled = true;
  saveAllBtn.classList.add('saving');

  const response = await sendMsg({ action: 'downloadAll', items });
  saveAllBtn.classList.remove('saving');

  if (response?.success) {
    const saved = response.total - response.failed;
    saveAllBtn.textContent = 'Saved ' + saved + '/' + response.total;
    for (const btn of mediaListEl.querySelectorAll('.save-btn:not(.saved)')) {
      btn.textContent = 'Saved';
      btn.classList.add('saved');
      savedUrls.add(btn.dataset.url);
    }
    if (response.failed > 0) {
      showToast(`Saved ${saved}/${response.total} \u2014 ${response.failed} failed`, 'error');
    } else {
      showToast(`Saved all ${response.total} files`, 'success');
    }
  } else {
    saveAllBtn.textContent = 'Save All';
    saveAllBtn.disabled = false;
    showToast('Save All failed', 'error');
  }
});

for (const btn of filterBtns) {
  btn.addEventListener('click', () => {
    for (const b of filterBtns) b.classList.remove('active');
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderMedia(allMedia, true);
  });
}

sortSelect.addEventListener('change', () => {
  currentSort = sortSelect.value;
  renderMedia(allMedia, true);
});

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

  // Dismiss preview when entering action button
  if (e.target.closest('.save-btn') || e.target.closest('.copy-btn')) {
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
  if (goingTo && item.contains(goingTo) && !goingTo.closest('.save-btn') && !goingTo.closest('.copy-btn')) return;

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

async function liveScan(tabId) {
  try {
    // Collect media from ALL frames (main + iframes) via executeScript
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => globalThis.__mediaLinkSaverMedia ?? null,
    });
    const combined = [];
    for (const frame of results) {
      if (frame.result) combined.push(...frame.result);
    }
    return combined.length > 0 ? combined : null;
  } catch {
    // Fallback: message-based scan (main frame only)
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
    activeTabId = tab.id;

    activePageUrl = canonicalUrl(tab.url);
    const pageUrl = activePageUrl;
    const cached = await getCachedMedia(pageUrl);
    const isFresh = cached && (Date.now() - cached.timestamp < CACHE_TTL_MS);

    if (cached) {
      // Show cached results immediately
      loadingEl.classList.add('hidden');
      allMedia = deduplicateMedia(cached.media);
      renderMedia(allMedia, true);
    }

    // Inject the content script into ALL frames (idempotent — won't double-inject)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['content/content.js'],
    });

    const freshMedia = await liveScan(tab.id);
    loadingEl.classList.add('hidden');

    if (freshMedia) {
      await setCachedMedia(pageUrl, freshMedia);

      // Only re-render if results differ from what's displayed
      if (!cached || !mediaEqual(allMedia, freshMedia)) {
        allMedia = deduplicateMedia(freshMedia);
        renderMedia(allMedia, true);
      }
    } else if (!cached) {
      emptyStateEl.classList.remove('hidden');
      summary.textContent = 'Could not scan this page';
    }

    // Poll for updates while popup is open (catches scroll / lazy-load / infinite scroll)
    const POLL_MS = 1500;
    const pollId = setInterval(async () => {
      if (!activeTabId) return;
      const fresh = await liveScan(activeTabId);
      if (!fresh) return;
      const deduped = deduplicateMedia(fresh);
      if (!mediaEqual(allMedia, deduped)) {
        allMedia = deduped;
        if (activePageUrl) setCachedMedia(activePageUrl, fresh);
        renderMedia(allMedia);
      }
    }, POLL_MS);
  } catch {
    loadingEl.classList.add('hidden');
    if (!allMedia.length) emptyStateEl.classList.remove('hidden');
  }
}

init();

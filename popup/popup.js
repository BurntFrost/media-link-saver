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
summary.setAttribute('role', 'status');
summary.setAttribute('aria-live', 'polite');
const optionsLink = document.createElement('a');
optionsLink.href = '#';
optionsLink.className = 'header-options-link';
optionsLink.textContent = 'Options';
optionsLink.setAttribute('aria-label', 'Open extension options');
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage?.();
});
header.append(h1, summary, optionsLink);

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
const copyUrlsBtn = document.createElement('button');
copyUrlsBtn.id = 'copy-urls-btn';
copyUrlsBtn.type = 'button';
copyUrlsBtn.disabled = true;
copyUrlsBtn.textContent = 'Copy URLs';
const exportCsvBtn = document.createElement('button');
exportCsvBtn.id = 'export-csv-btn';
exportCsvBtn.type = 'button';
exportCsvBtn.disabled = true;
exportCsvBtn.textContent = 'Export CSV';
const retryFailedBtn = document.createElement('button');
retryFailedBtn.id = 'retry-failed-btn';
retryFailedBtn.type = 'button';
retryFailedBtn.className = 'hidden';
retryFailedBtn.textContent = 'Retry failed';
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
controlsRow.append(filterRow, sortSelect, exportCsvBtn, copyUrlsBtn, retryFailedBtn, saveAllBtn);
controls.append(searchInput, controlsRow);

// Media list
const mediaListEl = document.createElement('div');
mediaListEl.id = 'media-list';

// Empty state
const emptyStateEl = document.createElement('div');
emptyStateEl.id = 'empty-state';
emptyStateEl.className = 'hidden';
emptyStateEl.setAttribute('role', 'status');
const emptyP = document.createElement('p');
emptyP.textContent = 'No media found on this page.';
emptyStateEl.appendChild(emptyP);
const emptyHint = document.createElement('p');
emptyHint.className = 'empty-state-hint';
emptyHint.textContent = 'Try scrolling or opening a page with images or videos.';
emptyStateEl.appendChild(emptyHint);

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
let lastFailedItems = [];

let options = { cacheTtlMinutes: 5, maxConcurrent: 4, excludePatterns: '' };
function loadOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['cacheTtlMinutes', 'maxConcurrent', 'excludePatterns'], (stored) => {
      if (stored.cacheTtlMinutes != null) options.cacheTtlMinutes = stored.cacheTtlMinutes;
      if (stored.maxConcurrent != null) options.maxConcurrent = stored.maxConcurrent;
      if (stored.excludePatterns != null) options.excludePatterns = stored.excludePatterns || '';
      resolve(options);
    });
  });
}

// ── Helpers ──

// Strip/replace chars that break downloads on Windows, macOS, Linux
const UNSAFE_FILENAME_RE = /[\s/\\:*?"<>|\x00-\x1f\x7f]/g;

function sanitizeFilename(name) {
  if (typeof name !== 'string' || !name.trim()) return 'file';
  const replaced = name.replace(UNSAFE_FILENAME_RE, '_');
  const trimmed = replaced.replace(/_+/g, '_').replace(/^_|_$/g, '').trim();
  return trimmed || 'file';
}

function filenameFromUrl(url) {
  try {
    if (url.startsWith('data:')) {
      const mime = url.match(/^data:([^;,]+)/)?.[1] ?? '';
      const ext = mime.split('/')[1]?.split('+')[0] ?? 'bin';
      return sanitizeFilename(`data.${ext}`);
    }
    const pathname = new URL(url).pathname;
    const raw = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) ?? 'file').slice(0, 80);
    return sanitizeFilename(raw) || 'file';
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

  if (options.excludePatterns) {
    const patterns = options.excludePatterns.split(/\n/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (patterns.length) {
      items = items.filter((m) => !patterns.some((pat) => m.url.toLowerCase().includes(pat)));
    }
  }

  return items;
}

// Query params that only affect resolution/format, not content identity.
// Stripping these lets us recognise the same image at different sizes.
const RESOLUTION_PARAMS = new Set([
  'width', 'height', 'w', 'h', 'size', 'resize',
  'quality', 'q', 'dpr', 'fit', 'crop', 'auto',
  'format', 'fm', 'fl', 's',
]);

function normalizeForDedup(url) {
  try {
    if (url.startsWith('data:')) return url;
    const u = new URL(url);
    for (const p of RESOLUTION_PARAMS) u.searchParams.delete(p);
    return u.href;
  } catch {
    return url;
  }
}

function getWidthParam(url) {
  try {
    const u = new URL(url);
    return parseInt(u.searchParams.get('width') ?? u.searchParams.get('w') ?? '0', 10);
  } catch {
    return 0;
  }
}

function deduplicateMedia(items) {
  const seenUrls = new Set();
  const seenNormalized = new Map(); // normalized URL → index in result
  const result = [];

  for (const item of items) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);

    const norm = normalizeForDedup(item.url);
    if (seenNormalized.has(norm)) {
      // Same image at different resolution — keep the largest
      const idx = seenNormalized.get(norm);
      if (getWidthParam(item.url) > getWidthParam(result[idx].url)) {
        result[idx] = item;
      }
      continue;
    }

    seenNormalized.set(norm, result.length);
    result.push(item);
  }

  return result;
}

function sendMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

let toastTimer = null;
function showToast(text, type = 'success') {
  clearTimeout(toastTimer);
  // Reset class first to restart CSS transition when called rapidly
  toastEl.className = '';
  toastEl.offsetWidth; // force reflow
  toastEl.textContent = text;
  toastEl.className = 'visible ' + type;
  toastTimer = setTimeout(() => { toastEl.className = ''; }, 2500);
}

// ── Build a single media-item DOM node ──

function createMediaItem(item, index, opts = {}) {
  const row = document.createElement('div');
  row.className = 'media-item' + (opts.virtual ? ' media-item-virtual' : '');
  row.dataset.index = index;
  row.dataset.url = item.url;
  row.style.animationDelay = opts.virtual ? '' : `${Math.min(index * 30, 300)}ms`;

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

  // Open in new tab (only for non-blob, non-embed URLs)
  if (!item.embed && !item.url.startsWith('blob:')) {
    const openLink = document.createElement('button');
    openLink.type = 'button';
    openLink.className = 'open-tab-btn';
    openLink.textContent = 'Open';
    openLink.title = 'Open in new tab';
    openLink.dataset.url = item.url;
    row.appendChild(openLink);
  }

  return row;
}

// ── Rendering ──

const VIRTUAL_LIST_THRESHOLD = 500;
const VIRTUAL_ROW_HEIGHT = 72;
const VIRTUAL_VIEWPORT_MAX_HEIGHT = 360;
const VIRTUAL_OVERSCAN = 6;

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
    mediaListEl.classList.remove('virtual-list-active');
    emptyStateEl.classList.remove('hidden');
    saveAllBtn.disabled = true;
    copyUrlsBtn.disabled = true;
    exportCsvBtn.disabled = true;
    return;
  }

  emptyStateEl.classList.add('hidden');
  saveAllBtn.disabled = false;
  copyUrlsBtn.disabled = false;
  exportCsvBtn.disabled = false;

  const images = mediaItems.filter((m) => m.type === 'image').length;
  const videos = mediaItems.filter((m) => m.type === 'video').length;
  const audios = mediaItems.filter((m) => m.type === 'audio').length;
  let text = 'Found ' + images + ' image' + (images !== 1 ? 's' : '') +
    ', ' + videos + ' video' + (videos !== 1 ? 's' : '');
  if (audios > 0) text += ', ' + audios + ' audio';
  summary.textContent = text;

  if (filtered.length >= VIRTUAL_LIST_THRESHOLD) {
    renderMediaVirtual(filtered, animate);
  } else {
    mediaListEl.classList.remove('virtual-list-active');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < filtered.length; i++) {
      fragment.appendChild(createMediaItem(filtered[i], i));
    }
    mediaListEl.classList.toggle('animate-items', animate);
    mediaListEl.replaceChildren(fragment);
  }
}

function renderMediaVirtual(filtered, animate) {
  mediaListEl.classList.add('virtual-list-active');
  let viewport = mediaListEl.querySelector('.virtual-list-viewport');
  let track = viewport?.querySelector('.virtual-list-track');
  let visible = viewport?.querySelector('.virtual-list-visible');

  if (!viewport) {
    viewport = document.createElement('div');
    viewport.className = 'virtual-list-viewport';
    track = document.createElement('div');
    track.className = 'virtual-list-track';
    visible = document.createElement('div');
    visible.className = 'virtual-list-visible';
    track.appendChild(visible);
    viewport.appendChild(track);
    mediaListEl.appendChild(viewport);

    let scrollRaf = null;
    viewport.addEventListener('scroll', () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        const state = viewport._virtualState;
        if (!state) return;
        updateVirtualVisible(viewport, state);
      });
    });
  }

  const totalHeight = filtered.length * VIRTUAL_ROW_HEIGHT;
  track.style.height = totalHeight + 'px';
  viewport._virtualState = { filtered, track, visible, totalHeight };

  viewport.scrollTop = 0;
  updateVirtualVisible(viewport, viewport._virtualState);
}

function updateVirtualVisible(viewport, state) {
  const { filtered, track, visible } = state;
  const scrollTop = viewport.scrollTop;
  const viewportHeight = viewport.clientHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);

  visible.style.top = startIndex * VIRTUAL_ROW_HEIGHT + 'px';
  const fragment = document.createDocumentFragment();
  for (let i = startIndex; i < endIndex; i++) {
    fragment.appendChild(createMediaItem(filtered[i], i, { virtual: true }));
  }
  visible.replaceChildren(fragment);
}

// ── Event Handlers ──

mediaListEl.addEventListener('click', async (e) => {
  const openBtn = e.target.closest('.open-tab-btn');
  if (openBtn) {
    try {
      chrome.tabs.create({ url: openBtn.dataset.url });
    } catch {
      showToast('Could not open tab', 'error');
    }
    return;
  }

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

// Live progress updates from service worker during Save All
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'downloadProgress' && saveAllBtn.classList.contains('saving')) {
    saveAllBtn.textContent = `Saving ${message.completed}/${message.total}\u2026`;
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

  saveAllBtn.textContent = `Saving 0/${items.length}\u2026`;
  saveAllBtn.disabled = true;
  copyUrlsBtn.disabled = true;
  exportCsvBtn.disabled = true;
  saveAllBtn.classList.add('saving');

  const maxConcurrent = Math.max(2, Math.min(8, options.maxConcurrent || 4));
  const response = await sendMsg({ action: 'downloadAll', items, maxConcurrent });
  saveAllBtn.classList.remove('saving');

  if (response?.success) {
    const saved = response.total - response.failed;
    const failedSet = new Set(response.failedUrls ?? []);

    // Only mark buttons as "Saved" for items that actually succeeded
    for (const btn of mediaListEl.querySelectorAll('.save-btn:not(.saved)')) {
      if (!failedSet.has(btn.dataset.url)) {
        btn.textContent = 'Saved';
        btn.classList.add('saved');
        savedUrls.add(btn.dataset.url);
      }
    }

    if (response.failed > 0) {
      const failedSet = new Set(response.failedUrls ?? []);
      lastFailedItems = items.filter((it) => failedSet.has(it.url));
      retryFailedBtn.classList.remove('hidden');
      saveAllBtn.textContent = 'Save All';
      saveAllBtn.disabled = false;
      copyUrlsBtn.disabled = false;
      exportCsvBtn.disabled = false;
      showToast(`Saved ${saved}/${response.total} \u2014 ${response.failed} failed`, 'error');
    } else {
      lastFailedItems = [];
      retryFailedBtn.classList.add('hidden');
      saveAllBtn.textContent = `Saved All ${saved}`;
      saveAllBtn.disabled = false;
      copyUrlsBtn.disabled = false;
      exportCsvBtn.disabled = false;
      showToast(`Saved all ${response.total} files`, 'success');
    }
  } else {
    lastFailedItems = [];
    retryFailedBtn.classList.add('hidden');
    saveAllBtn.textContent = 'Save All';
    saveAllBtn.disabled = false;
    copyUrlsBtn.disabled = false;
    exportCsvBtn.disabled = false;
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

copyUrlsBtn.addEventListener('click', async () => {
  const items = getFiltered().filter((m) => !m.embed);
  if (items.length === 0) {
    showToast('No URLs to copy', 'info');
    return;
  }
  const text = items.map((m) => m.url).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied ${items.length} URL${items.length !== 1 ? 's' : ''} to clipboard`, 'success');
  } catch {
    showToast('Failed to copy', 'error');
  }
});

function escapeCsvCell(str) {
  const s = String(str ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

exportCsvBtn.addEventListener('click', async () => {
  const items = getFiltered().filter((m) => !m.embed);
  if (items.length === 0) {
    showToast('No items to export', 'info');
    return;
  }
  const headerRow = 'filename,url,type';
  const rows = items.map((m) =>
    [escapeCsvCell(filenameFromUrl(m.url)), escapeCsvCell(m.url), escapeCsvCell(m.type)].join(',')
  );
  const csv = [headerRow, ...rows].join('\n');
  try {
    await navigator.clipboard.writeText(csv);
    showToast(`Copied ${items.length} rows as CSV`, 'success');
  } catch {
    showToast('Failed to copy CSV', 'error');
  }
});

retryFailedBtn.addEventListener('click', async () => {
  if (lastFailedItems.length === 0) return;
  const toRetry = lastFailedItems.slice();
  retryFailedBtn.classList.add('hidden');
  saveAllBtn.textContent = `Saving 0/${toRetry.length}\u2026`;
  saveAllBtn.disabled = true;
  copyUrlsBtn.disabled = true;
  exportCsvBtn.disabled = true;
  saveAllBtn.classList.add('saving');
  const maxConcurrent = Math.max(2, Math.min(8, options.maxConcurrent || 4));
  const response = await sendMsg({ action: 'downloadAll', items: toRetry, maxConcurrent });
  saveAllBtn.classList.remove('saving');
  if (response?.success && response.failed === 0) {
    lastFailedItems = [];
    const urls = toRetry.map((x) => x.url);
    for (const btn of mediaListEl.querySelectorAll('.save-btn')) {
      if (urls.includes(btn.dataset.url)) {
        btn.textContent = 'Saved';
        btn.classList.add('saved');
        savedUrls.add(btn.dataset.url);
      }
    }
    showToast(`Retried: saved all ${toRetry.length}`, 'success');
  } else if (response?.success && response.failed > 0) {
    const failedSet = new Set(response.failedUrls ?? []);
    lastFailedItems = toRetry.filter((it) => failedSet.has(it.url));
    retryFailedBtn.classList.remove('hidden');
    showToast(`Retry: ${response.total - response.failed}/${response.total} saved, ${response.failed} failed`, 'error');
  } else {
    lastFailedItems = toRetry.slice();
    retryFailedBtn.classList.remove('hidden');
    showToast('Retry failed', 'error');
  }
  saveAllBtn.textContent = 'Save All';
  saveAllBtn.disabled = false;
  copyUrlsBtn.disabled = false;
  exportCsvBtn.disabled = false;
});

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
  const target = e.target;
  const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      return;
    }
    if (e.key === 'Enter' && !isInput && saveAllBtn.classList.contains('saving') === false) {
      if (!saveAllBtn.disabled) {
        e.preventDefault();
        saveAllBtn.click();
      }
    }
  }
});

// ── Hover Preview ──

let activePreviewItem = null;
let hoverTimer = null;
let previewAbort = null;
const HOVER_DELAY_MS = 350;

function canPreviewUrl(url) {
  // blob: and data: URLs are scoped to the page context — the popup can't load them.
  // Embed URLs (YouTube etc.) are watch pages, not direct media.
  return url && !url.startsWith('blob:') && !url.startsWith('data:');
}

function showPreview(mediaItem, itemEl) {
  previewAbort?.abort();
  previewAbort = new AbortController();
  const { signal } = previewAbort;

  previewOverlay.replaceChildren();

  if (mediaItem.type === 'image') {
    if (!canPreviewUrl(mediaItem.url)) return;
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
    if (!canPreviewUrl(mediaItem.url) || mediaItem.embed) return;
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

  if (itemEl.isConnected) {
    itemEl.classList.add('previewing');
    activePreviewItem = itemEl;
  } else {
    activePreviewItem = null;
  }
}

// Persistent listener — clean up preview content after fade-out transition.
// Placed outside hidePreview() to avoid accumulating { once: true } listeners
// when hidePreview() is called rapidly or the transition never fires.
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
});

function hidePreview() {
  previewAbort?.abort();
  previewAbort = null;
  previewOverlay.classList.remove('visible');

  if (activePreviewItem) {
    activePreviewItem.classList.remove('previewing');
    activePreviewItem = null;
  }
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
  if (e.target.closest('.save-btn') || e.target.closest('.copy-btn') || e.target.closest('.open-tab-btn')) {
    cancelPendingPreview();
    hidePreview();
    return;
  }

  cancelPendingPreview();
  hoverTimer = setTimeout(() => {
    const url = item.dataset.url;
    if (!url) return;
    if (!item.isConnected) return;
    const mediaItem = getFiltered().find((m) => m.url === url);
    if (mediaItem) showPreview(mediaItem, item);
  }, HOVER_DELAY_MS);
}, true);

mediaListEl.addEventListener('mouseleave', (e) => {
  const item = e.target.closest('.media-item');
  if (!item) return;

  // Only dismiss when truly leaving the row (relatedTarget is outside this item)
  const goingTo = e.relatedTarget;
  if (goingTo && item.contains(goingTo) && !goingTo.closest('.save-btn') && !goingTo.closest('.copy-btn') && !goingTo.closest('.open-tab-btn')) return;

  cancelPendingPreview();
  hidePreview();
}, true);

// ── IndexedDB Cache ──

const CACHE_DB_NAME = 'MediaLinkSaverDB';
const CACHE_STORE = 'mediaCache';
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // evict entries older than 24h

function getCacheTtlMs() {
  return (options.cacheTtlMinutes || 5) * 60 * 1000;
}

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

async function evictStaleCacheEntries() {
  try {
    const db = await openCacheDB();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    const cutoff = Date.now() - MAX_CACHE_AGE_MS;
    return new Promise((resolve) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (cursor.value.timestamp < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch {
    // Non-critical
  }
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

    await loadOptions();
    await evictStaleCacheEntries();
    const cached = await getCachedMedia(pageUrl);
    const cacheTtlMs = getCacheTtlMs();
    const isFresh = cached && (Date.now() - cached.timestamp < cacheTtlMs);

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

    // Adaptive polling: 1.5s for first 30s (catch quick lazy-load), then 2.5s
    const POLL_FAST_MS = 1500;
    const POLL_SLOW_MS = 2500;
    const POLL_FAST_DURATION_MS = 30 * 1000;
    const pollStart = Date.now();
    let pollTimeoutId = null;

    function schedulePoll() {
      const elapsed = Date.now() - pollStart;
      const delay = elapsed < POLL_FAST_DURATION_MS ? POLL_FAST_MS : POLL_SLOW_MS;
      pollTimeoutId = setTimeout(async () => {
        if (!activeTabId) {
          schedulePoll();
          return;
        }
        const fresh = await liveScan(activeTabId);
        if (fresh) {
          const deduped = deduplicateMedia(fresh);
          if (!mediaEqual(allMedia, deduped)) {
            allMedia = deduped;
            if (activePageUrl) await setCachedMedia(activePageUrl, fresh);
            renderMedia(allMedia);
          }
        }
        schedulePoll();
      }, delay);
    }
    schedulePoll();

    window.addEventListener('unload', () => {
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
    });
  } catch {
    loadingEl.classList.add('hidden');
    if (!allMedia.length) emptyStateEl.classList.remove('hidden');
  }
}

init();

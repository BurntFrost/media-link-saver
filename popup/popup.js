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
optionsLink.textContent = '\u2699\uFE0F'; // ⚙️
optionsLink.title = 'Extension settings (cache, concurrency, exclude patterns)';
optionsLink.setAttribute('aria-label', 'Open extension options');
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage?.();
});

// Side panel toggle (only shown in popup context, not when already in side panel)
const sidePanelBtn = document.createElement('a');
sidePanelBtn.href = '#';
sidePanelBtn.className = 'header-sidepanel-link';
sidePanelBtn.title = 'Open in side panel';
sidePanelBtn.setAttribute('aria-label', 'Open in side panel');
const sidePanelSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
sidePanelSvg.setAttribute('viewBox', '0 0 16 16');
sidePanelSvg.setAttribute('width', '16');
sidePanelSvg.setAttribute('height', '16');
sidePanelSvg.setAttribute('fill', 'none');
const spRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
spRect.setAttribute('x', '1.5');
spRect.setAttribute('y', '2.5');
spRect.setAttribute('width', '13');
spRect.setAttribute('height', '11');
spRect.setAttribute('rx', '2');
spRect.setAttribute('stroke', 'currentColor');
spRect.setAttribute('stroke-width', '1.5');
const spLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
spLine.setAttribute('x1', '10');
spLine.setAttribute('y1', '2.5');
spLine.setAttribute('x2', '10');
spLine.setAttribute('y2', '13.5');
spLine.setAttribute('stroke', 'currentColor');
spLine.setAttribute('stroke-width', '1.5');
sidePanelSvg.append(spRect, spLine);
sidePanelBtn.appendChild(sidePanelSvg);
sidePanelBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close(); // close popup after opening side panel
    } else {
      showToast('Side panel not supported', 'error');
    }
  } catch {
    showToast('Could not open side panel', 'error');
  }
});
// Hide the side panel button if we're already inside the side panel
const isSidePanel = window.location.pathname.includes('sidepanel');
if (isSidePanel) sidePanelBtn.classList.add('hidden');

header.append(h1, summary, sidePanelBtn, optionsLink);

// Controls
const controls = document.createElement('div');
controls.id = 'controls';

// Dimension filter inputs (moved into advanced panel)
const minWInput = document.createElement('input');
minWInput.type = 'number';
minWInput.min = '0';
minWInput.placeholder = 'Min W';
minWInput.id = 'min-width-input';
minWInput.title = 'Minimum width (px)';
const minHInput = document.createElement('input');
minHInput.type = 'number';
minHInput.min = '0';
minHInput.placeholder = 'Min H';
minHInput.id = 'min-height-input';
minHInput.title = 'Minimum height (px)';

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
  const labelSpan = document.createTextNode(label);
  const countSpan = document.createElement('span');
  countSpan.className = 'filter-count';
  countSpan.textContent = '0';
  btn.append(labelSpan, countSpan);
  btn._countEl = countSpan;
  return btn;
});
filterRow.append(...filterBtns);

const searchInput = document.createElement('input');
searchInput.id = 'search-input';
searchInput.type = 'text';
searchInput.placeholder = 'Search media\u2026';
searchInput.title = 'Filter by filename or URL (Ctrl+F)';

// Convert format select
const convertSelect = document.createElement('select');
convertSelect.id = 'convert-select';
for (const [val, label] of [
  ['original', 'Original'],
  ['jpg', 'JPG'],
  ['png', 'PNG'],
]) {
  const opt = document.createElement('option');
  opt.value = val; opt.textContent = label;
  convertSelect.appendChild(opt);
}

// ZIP toggle
const zipToggle = document.createElement('button');
zipToggle.id = 'zip-toggle-btn';
zipToggle.type = 'button';
zipToggle.textContent = 'ZIP';
zipToggle.title = 'Download as a single ZIP file';

// Filters (advanced) toggle
const advancedBtn = document.createElement('button');
advancedBtn.id = 'advanced-btn';
advancedBtn.type = 'button';
advancedBtn.textContent = 'Filters';
advancedBtn.title = 'Show filters and advanced options';

const saveAllBtn = document.createElement('button');
saveAllBtn.id = 'save-all-btn';
saveAllBtn.disabled = true;
saveAllBtn.textContent = 'Save All';
saveAllBtn.title = 'Download all visible media files';
const copyUrlsBtn = document.createElement('button');
copyUrlsBtn.id = 'copy-urls-btn';
copyUrlsBtn.type = 'button';
copyUrlsBtn.disabled = true;
copyUrlsBtn.textContent = 'Copy URLs';
copyUrlsBtn.title = 'Copy all visible URLs to clipboard';
const exportCsvBtn = document.createElement('button');
exportCsvBtn.id = 'export-csv-btn';
exportCsvBtn.type = 'button';
exportCsvBtn.disabled = true;
exportCsvBtn.textContent = 'Export CSV';
exportCsvBtn.title = 'Copy media list as CSV to clipboard';
const retryFailedBtn = document.createElement('button');
retryFailedBtn.id = 'retry-failed-btn';
retryFailedBtn.type = 'button';
retryFailedBtn.className = 'hidden';
retryFailedBtn.textContent = 'Retry failed';
retryFailedBtn.title = 'Retry downloading files that failed';
function makeSortSvg(mode) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sort-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  if (mode === 'default') {
    // Up arrow
    const up = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    up.setAttribute('d', 'M8 3L5 6h6L8 3z');
    up.setAttribute('fill', 'currentColor');
    svg.appendChild(up);
    // Down arrow
    const down = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    down.setAttribute('d', 'M8 13l3-3H5l3 3z');
    down.setAttribute('fill', 'currentColor');
    svg.appendChild(down);
  } else if (mode === 'name-asc') {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M8 3l-4 5h8L8 3z');
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
  } else {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M8 13l4-5H4l4 5z');
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
  }
  return svg;
}
const SORT_MODES = [
  { key: 'default', title: 'Default order' },
  { key: 'name-asc', title: 'Sort A\u2013Z' },
  { key: 'name-desc', title: 'Sort Z\u2013A' },
];
let sortIndex = 0;
const sortBtn = document.createElement('button');
sortBtn.id = 'sort-btn';
sortBtn.type = 'button';
sortBtn.replaceChildren(makeSortSvg(SORT_MODES[0].key));
sortBtn.title = SORT_MODES[0].title;

// View toggle (list / grid)
const viewToggle = document.createElement('div');
viewToggle.className = 'view-toggle';
const listViewBtn = document.createElement('button');
listViewBtn.className = 'view-toggle-btn active';
listViewBtn.type = 'button';
listViewBtn.title = 'List view';
listViewBtn.textContent = '\u2630'; // ☰ hamburger
const gridViewBtn = document.createElement('button');
gridViewBtn.className = 'view-toggle-btn';
gridViewBtn.type = 'button';
gridViewBtn.title = 'Grid view';
gridViewBtn.textContent = '\u25A6'; // ▦ grid
viewToggle.append(listViewBtn, gridViewBtn, sortBtn);

const controlsRow = document.createElement('div');
controlsRow.className = 'controls-row';
controlsRow.append(filterRow, viewToggle);

const actionsRow = document.createElement('div');
actionsRow.className = 'controls-row';
// Selection mode controls
const selectModeBtn = document.createElement('button');
selectModeBtn.id = 'select-mode-btn';
selectModeBtn.type = 'button';
selectModeBtn.textContent = 'Select';
selectModeBtn.title = 'Toggle selection mode';
const selectAllBtn = document.createElement('button');
selectAllBtn.id = 'select-all-btn';
selectAllBtn.type = 'button';
selectAllBtn.textContent = 'Select All';
selectAllBtn.title = 'Select all visible';
selectAllBtn.className = 'hidden';
const clearSelBtn = document.createElement('button');
clearSelBtn.id = 'clear-sel-btn';
clearSelBtn.type = 'button';
clearSelBtn.textContent = 'Clear';
clearSelBtn.title = 'Clear selection';
clearSelBtn.className = 'hidden';

// Overflow menu (hamburger) — houses ZIP, Copy URLs, Export CSV
const overflowBtn = document.createElement('button');
overflowBtn.id = 'overflow-btn';
overflowBtn.type = 'button';
overflowBtn.title = 'More actions';
overflowBtn.setAttribute('aria-label', 'More actions');
overflowBtn.setAttribute('aria-haspopup', 'true');
const overflowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
overflowSvg.setAttribute('viewBox', '0 0 16 16');
overflowSvg.setAttribute('width', '16');
overflowSvg.setAttribute('height', '16');
overflowSvg.setAttribute('fill', 'currentColor');
for (const cy of [3, 8, 13]) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '8');
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', '1.5');
  overflowSvg.appendChild(c);
}
overflowBtn.appendChild(overflowSvg);

const overflowMenu = document.createElement('div');
overflowMenu.id = 'overflow-menu';
overflowMenu.className = 'hidden';

// Build menu items
function makeOverflowItem(label, icon, btn) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'overflow-menu-item';
  item.textContent = `${icon} ${label}`;
  item.addEventListener('click', () => {
    btn.click();
    dismissOverflowMenu();
  });
  return item;
}

// Save All menu item — special: shows count when selecting
const saveAllMenuItem = document.createElement('button');
saveAllMenuItem.type = 'button';
saveAllMenuItem.className = 'overflow-menu-item overflow-menu-save';
saveAllMenuItem.textContent = '\uD83D\uDCBE Save All';
saveAllMenuItem.addEventListener('click', () => {
  saveAllBtn.click();
  dismissOverflowMenu();
});

overflowMenu.append(
  saveAllMenuItem,
  makeOverflowItem('Save as ZIP', '\uD83D\uDDDC\uFE0F', zipToggle),
  makeOverflowItem('Copy URLs', '\uD83D\uDD17', copyUrlsBtn),
  makeOverflowItem('Export CSV', '\uD83D\uDCCB', exportCsvBtn),
);

// ZIP active indicator — sync with toggle state
const zipMenuItem = overflowMenu.children[1];
function updateZipMenuItem() {
  zipMenuItem.classList.toggle('active', zipMode);
  zipMenuItem.textContent = zipMode ? '\u2705 ZIP mode ON' : '\uD83D\uDDDC\uFE0F Save as ZIP';
}

// Keep Save All menu item label in sync
function updateSaveAllMenuItem() {
  const count = selectedUrls.size;
  if (saveAllBtn.classList.contains('saving')) {
    saveAllMenuItem.textContent = saveAllBtn.textContent;
    saveAllMenuItem.disabled = true;
  } else if (saveAllBtn.disabled) {
    saveAllMenuItem.textContent = '\uD83D\uDCBE Save All';
    saveAllMenuItem.disabled = true;
  } else if (count > 0) {
    saveAllMenuItem.textContent = `\uD83D\uDCBE Save Selected (${count})`;
    saveAllMenuItem.disabled = false;
  } else if (zipMode) {
    saveAllMenuItem.textContent = '\uD83D\uDCBE Save All (ZIP)';
    saveAllMenuItem.disabled = false;
  } else {
    saveAllMenuItem.textContent = '\uD83D\uDCBE Save All';
    saveAllMenuItem.disabled = false;
  }
}

const overflowWrap = document.createElement('div');
overflowWrap.id = 'overflow-wrap';
overflowWrap.append(overflowBtn);

let overflowOpen = false;
function dismissOverflowMenu() {
  overflowMenu.classList.add('hidden');
  overflowOpen = false;
}
overflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  overflowOpen = !overflowOpen;
  if (overflowOpen) {
    updateZipMenuItem();
    updateSaveAllMenuItem();
    // Position fixed below the button
    const rect = overflowBtn.getBoundingClientRect();
    overflowMenu.style.top = (rect.bottom + 6) + 'px';
    overflowMenu.style.right = (window.innerWidth - rect.right) + 'px';
    overflowMenu.classList.remove('hidden');
    app.appendChild(overflowMenu);
    requestAnimationFrame(() => {
      const handler = (evt) => {
        if (!overflowMenu.contains(evt.target) && evt.target !== overflowBtn) {
          dismissOverflowMenu();
          document.removeEventListener('click', handler, true);
        }
      };
      document.addEventListener('click', handler, true);
    });
  } else {
    dismissOverflowMenu();
  }
});

viewToggle.append(listViewBtn, gridViewBtn, sortBtn);
actionsRow.append(selectModeBtn, advancedBtn, retryFailedBtn, overflowWrap);

// Collapsible advanced panel
const advancedPanel = document.createElement('div');
advancedPanel.id = 'advanced-panel';
advancedPanel.className = 'hidden';

// Advanced content: dimension inputs + format conversion on one row, selection helpers below
const advRow1 = document.createElement('div');
advRow1.className = 'adv-row';
advRow1.append(minWInput, minHInput, convertSelect);

const advRow3 = document.createElement('div');
advRow3.className = 'adv-row';
advRow3.append(selectAllBtn, clearSelBtn);

advancedPanel.append(advRow1, advRow3);
controls.append(searchInput, controlsRow, actionsRow);

// Media list
const mediaListEl = document.createElement('div');
mediaListEl.id = 'media-list';

// Empty state
const emptyStateEl = document.createElement('div');
emptyStateEl.id = 'empty-state';
emptyStateEl.className = 'hidden';
emptyStateEl.setAttribute('role', 'status');
const emptyIcon = document.createElement('span');
emptyIcon.className = 'empty-state-icon';
emptyIcon.textContent = '\uD83D\uDDBC\uFE0F'; // 🖼️
emptyStateEl.appendChild(emptyIcon);
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

// Move dimension inputs into advanced panel (see below) instead of top-level
// controls.prepend(dimRow);
controls.append(advancedPanel);
app.append(header, controls, mediaListEl, emptyStateEl, loadingEl, previewOverlay, toastEl);

// ── State ──

let allMedia = [];
let currentFilter = 'all';
let currentSort = 'default';
let searchQuery = '';
let currentView = 'list';
let minWidth = 0;
let minHeight = 0;
let selectMode = false;
const selectedUrls = new Set();
let convertFormat = 'original';
let zipMode = false;
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

function passesDimFilter(item) {
  if (!minWidth && !minHeight) return true;
  const w = item.width || 0;
  const h = item.height || 0;
  if (minWidth && w && w < minWidth) return false;
  if (minHeight && h && h < minHeight) return false;
  // If dimensions unknown, keep item (user can still inspect)
  return true;
}

async function loadUiPrefs() {
  try {
    const stored = await new Promise((resolve) => chrome.storage.sync.get(['uiAdvancedOpen'], resolve));
    const open = !!stored.uiAdvancedOpen;
    advancedPanel.classList.toggle('hidden', !open);
    advancedBtn.classList.toggle('active', open);
    advancedBtn.title = open ? 'Hide filters and advanced options' : 'Show filters and advanced options';
  } catch { /* ignore */ }
}

function getFiltered() {
  let items = currentFilter === 'all'
    ? allMedia
    : allMedia.filter((m) => m.type === currentFilter);

  // Dimension filters
  items = items.filter(passesDimFilter);

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

// ── Source label mapping ──

const SOURCE_LABELS = {
  'link': 'link',
  'img': 'img',
  'img-srcset': 'srcset',
  'lazy': 'lazy',
  'lazy-srcset': 'lazy',
  'video': 'video',
  'video-poster': 'poster',
  'video-derived': 'derived',
  'source': 'source',
  'audio': 'audio',
  'picture-source': 'picture',
  'css-bg': 'css',
  'meta': 'og/meta',
  'noscript': 'noscript',
  'preload': 'preload',
  'json-ld': 'json-ld',
  'embed': 'embed',
  'canvas': 'canvas',
  'script-data': 'script',
  'resource-timing': 'timing',
  'microdata': 'schema',
  'yt-thumb': 'youtube',
};

function makeCheckSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'check-icon');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('fill', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2.5 7.5L5.5 10.5L11.5 4');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

// ── Build a single media-item DOM node ──

function formatFileSize(bytes) {
  const b = Number(bytes || 0);
  if (!b) return '';
  const units = ['B','KB','MB','GB'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

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
  } else if (item.type === 'video' && !item.blob && !item.embed && !item.url.startsWith('blob:') && !item.url.startsWith('data:')) {
    const vid = document.createElement('video');
    vid.className = 'media-thumb';
    vid.preload = 'metadata';
    vid.muted = true;
    vid.playsInline = true;
    vid.src = item.url;
    vid.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'media-thumb placeholder';
      ph.textContent = '\uD83C\uDFA5';
      vid.replaceWith(ph);
    }, { once: true });
    row.appendChild(vid);
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

  // Selection checkbox (appears in select mode)
  if (selectMode) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'select-checkbox';
    cb.checked = selectedUrls.has(item.url);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedUrls.add(item.url); else selectedUrls.delete(item.url);
      updateSelectionUi();
    });
    row.prepend(cb);
  }

  const badge = document.createElement('span');
  badge.className = 'media-type-badge ' + item.type;
  badge.textContent = item.type;

  meta.append(badge);

  // Dimension + size badges
  if (item.width && item.height) {
    const dim = document.createElement('span');
    dim.className = 'media-dim-badge';
    dim.textContent = `${item.width}×${item.height}`;
    meta.append(dim);
  }
  if (item.fileSize) {
    const size = document.createElement('span');
    size.className = 'media-size-badge';
    size.textContent = formatFileSize(item.fileSize);
    meta.append(size);
  }

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
  urlLabel.className = 'media-url';
  urlLabel.textContent = truncateUrl(item.url);
  urlLabel.title = item.url;

  meta.append(urlLabel);

  // Source pill — skip when label is redundant with the type badge
  const sourceLabel = item.source ? (SOURCE_LABELS[item.source] ?? item.source) : null;
  const isRedundant = sourceLabel && (sourceLabel === item.type || sourceLabel === 'img' || sourceLabel === 'source');
  if (sourceLabel && !isRedundant) {
    const srcPill = document.createElement('span');
    srcPill.className = 'media-source-pill';
    srcPill.textContent = sourceLabel;
    meta.append(srcPill);
  }

  info.append(fnEl, meta);
  row.appendChild(info);

  // Action buttons
  if (item.embed) {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.title = 'Copy URL to clipboard';
    btn.dataset.url = item.url;
    row.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'save-btn';
    btn.dataset.url = item.url;
    btn.dataset.filename = filename;
    btn.title = 'Download this file';
    if (item.blob) btn.dataset.blob = 'true';
    if (savedUrls.has(item.url)) {
      btn.replaceChildren(makeCheckSvg(), document.createTextNode('Saved'));
      btn.classList.add('saved');
      btn.title = 'Already downloaded';
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

  // Reverse image search (only for images with fetchable URLs)
  if (item.type === 'image' && !item.url.startsWith('blob:') && !item.url.startsWith('data:') && !item.embed) {
    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'search-btn';
    searchBtn.textContent = '\uD83D\uDD0D';
    searchBtn.title = 'Reverse image search';
    searchBtn.dataset.url = item.url;
    row.appendChild(searchBtn);
  }

  return row;
}

// ── Rendering ──

const VIRTUAL_LIST_THRESHOLD = 500;
const VIRTUAL_ROW_HEIGHT = 72;
const VIRTUAL_VIEWPORT_MAX_HEIGHT = 360;
const VIRTUAL_OVERSCAN = 6;

function renderMedia(mediaItems, animate = false) {
  // Show/hide filter tabs based on available types and update counts
  const typeCounts = { all: 0, image: 0, video: 0, audio: 0 };
  for (const item of allMedia) {
    typeCounts.all++;
    if (item.type in typeCounts) typeCounts[item.type]++;
  }
  for (const btn of filterBtns) {
    const key = btn.dataset.filter;
    if (key !== 'all') btn.classList.toggle('hidden', typeCounts[key] === 0);
    btn._countEl.textContent = typeCounts[key] ?? 0;
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
    const isGrid = currentView === 'grid';
    const container = isGrid ? document.createElement('div') : document.createDocumentFragment();
    if (isGrid) container.className = 'media-grid';
    for (let i = 0; i < filtered.length; i++) {
      container.appendChild(createMediaItem(filtered[i], i));
    }
    mediaListEl.classList.toggle('animate-items', animate);
    mediaListEl.replaceChildren(container);
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

// ── Reverse Image Search ──

const REVERSE_SEARCH_ENGINES = [
  { label: 'Google Lens', url: (src) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(src)}` },
  { label: 'Bing Visual', url: (src) => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(src)}` },
  { label: 'TinEye', url: (src) => `https://tineye.com/search?url=${encodeURIComponent(src)}` },
];

let activeSearchDropdown = null;

function dismissSearchDropdown() {
  if (activeSearchDropdown) {
    activeSearchDropdown.remove();
    activeSearchDropdown = null;
  }
}

function showSearchDropdown(anchorBtn) {
  dismissSearchDropdown();
  const url = anchorBtn.dataset.url;
  if (!url) return;

  const menu = document.createElement('div');
  menu.className = 'search-dropdown';

  for (const engine of REVERSE_SEARCH_ENGINES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'search-dropdown-item';
    item.textContent = engine.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: engine.url(url) });
      dismissSearchDropdown();
    });
    menu.appendChild(item);
  }

  // Position fixed relative to viewport so it's never clipped by overflow
  const rect = anchorBtn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = 'auto';
  menu.style.right = 'auto';
  // Show above the button if near the bottom, below otherwise
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < 130) {
    menu.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    menu.style.left = Math.max(4, rect.left - 80) + 'px';
  } else {
    menu.style.top = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(4, rect.left - 80) + 'px';
  }
  app.appendChild(menu);
  activeSearchDropdown = menu;

  // Close on outside click (next tick to avoid immediate dismiss)
  requestAnimationFrame(() => {
    const handler = (evt) => {
      if (!menu.contains(evt.target) && evt.target !== anchorBtn) {
        dismissSearchDropdown();
        document.removeEventListener('click', handler, true);
      }
    };
    document.addEventListener('click', handler, true);
  });
}

// ── Event Handlers ──

mediaListEl.addEventListener('click', async (e) => {
  // Reverse image search button
  const searchBtn = e.target.closest('.search-btn');
  if (searchBtn) {
    e.stopPropagation();
    showSearchDropdown(searchBtn);
    return;
  }

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
  const url = btn.dataset.url;
  const filename = btn.dataset.filename;
  let response;
  if (!isBlob && convertFormat !== 'original' && !url.startsWith('blob:')) {
    response = await sendMsg({ action: 'downloadConverted', url, filename, format: convertFormat, tabId: activeTabId });
  } else if (isBlob) {
    response = await sendMsg({ action: 'downloadBlob', blobUrl: url, filename, tabId: activeTabId });
  } else {
    response = await sendMsg({ action: 'download', url, filename });
  }

  if (response?.success) {
    btn.replaceChildren(makeCheckSvg(), document.createTextNode('Saved'));
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
// + push-based media updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'downloadProgress' && saveAllBtn.classList.contains('saving')) {
    saveAllBtn.textContent = `Saving ${message.completed}/${message.total}\u2026`;
  }
  // Content script pushed a media update — render immediately
  if (message.action === 'mediaUpdated' && message.media) {
    const deduped = deduplicateMedia(message.media);
    if (!mediaEqual(allMedia, deduped)) {
      allMedia = deduped;
      renderMedia(allMedia);
      if (activePageUrl) setCachedMedia(activePageUrl, message.media);
    }
  }
});

function collectDownloadItems() {
  const base = getFiltered()
    .filter((m) => !m.embed)
    .filter((m) => (selectedUrls.size ? selectedUrls.has(m.url) : true))
    .map((m) => ({ url: m.url, filename: filenameFromUrl(m.url), blob: !!m.blob, tabId: activeTabId, type: m.type }));
  return base;
}

function updateSelectionUi() {
  const count = selectedUrls.size;
  if (selectMode) {
    selectAllBtn.classList.remove('hidden');
    clearSelBtn.classList.remove('hidden');
  } else {
    selectAllBtn.classList.add('hidden');
    clearSelBtn.classList.add('hidden');
  }
  saveAllBtn.textContent = count > 0 ? `Save Selected (${count})` : (zipMode ? 'Save All (ZIP)' : 'Save All');
}

saveAllBtn.addEventListener('click', async () => {
  const items = collectDownloadItems();

  saveAllBtn.textContent = `Saving 0/${items.length}\u2026`;
  saveAllBtn.disabled = true;
  copyUrlsBtn.disabled = true;
  exportCsvBtn.disabled = true;
  saveAllBtn.classList.add('saving');

  let response;
  if (zipMode) {
    response = await sendMsg({ action: 'downloadZip', items: items, tabId: activeTabId, convertFormat });
  } else if (convertFormat !== 'original') {
    // Sequential per-item flow to honor conversion without ZIP
    let failed = 0;
    const failedUrls = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let r;
      try {
        if (it.type === 'image' && !it.blob && !it.url.startsWith('blob:')) {
          r = await sendMsg({ action: 'downloadConverted', url: it.url, filename: it.filename, format: convertFormat, tabId: activeTabId });
        } else if (it.blob) {
          r = await sendMsg({ action: 'downloadBlob', blobUrl: it.url, filename: it.filename, tabId: activeTabId });
        } else {
          r = await sendMsg({ action: 'download', url: it.url, filename: it.filename });
        }
      } catch { r = null; }
      if (!r?.success) { failed++; failedUrls.push(it.url); }
      saveAllBtn.textContent = `Saving ${i + 1}/${items.length}\u2026`;
    }
    response = { success: true, total: items.length, failed, failedUrls };
  } else {
    const maxConcurrent = Math.max(2, Math.min(8, options.maxConcurrent || 4));
    response = await sendMsg({ action: 'downloadAll', items, maxConcurrent });
  }
  saveAllBtn.classList.remove('saving');

  if (response?.success) {
    const saved = response.total - response.failed;
    const failedSet = new Set(response.failedUrls ?? []);

    // Only mark buttons as "Saved" for items that actually succeeded
    for (const btn of mediaListEl.querySelectorAll('.save-btn:not(.saved)')) {
      if (!failedSet.has(btn.dataset.url)) {
        btn.replaceChildren(makeCheckSvg(), document.createTextNode('Saved'));
        btn.classList.add('saved');
        savedUrls.add(btn.dataset.url);
      }
    }

    if (response.failed > 0) {
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

minWInput.addEventListener('input', () => {
  minWidth = Math.max(0, parseInt(minWInput.value || '0', 10));
  renderMedia(allMedia);
});
minHInput.addEventListener('input', () => {
  minHeight = Math.max(0, parseInt(minHInput.value || '0', 10));
  renderMedia(allMedia);
});

convertSelect.addEventListener('change', () => {
  convertFormat = convertSelect.value;
});

zipToggle.addEventListener('click', () => {
  zipMode = !zipMode;
  zipToggle.classList.toggle('active', zipMode);
  updateZipMenuItem();
  updateSelectionUi();
});

advancedBtn.addEventListener('click', () => {
  const isHidden = advancedPanel.classList.toggle('hidden');
  const open = !isHidden;
  advancedBtn.classList.toggle('active', open);
  advancedBtn.title = open ? 'Hide filters and advanced options' : 'Show filters and advanced options';
  try { chrome.storage.sync.set({ uiAdvancedOpen: open }); } catch {}
});

selectModeBtn.addEventListener('click', () => {
  selectMode = !selectMode;
  if (!selectMode) selectedUrls.clear();
  updateSelectionUi();
  renderMedia(allMedia, true);
});

selectAllBtn.addEventListener('click', () => {
  const filtered = getFiltered();
  for (const it of filtered) selectedUrls.add(it.url);
  updateSelectionUi();
  renderMedia(allMedia);
});

clearSelBtn.addEventListener('click', () => {
  selectedUrls.clear();
  updateSelectionUi();
  renderMedia(allMedia);
});

for (const btn of filterBtns) {
  btn.addEventListener('click', () => {
    for (const b of filterBtns) b.classList.remove('active');
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderMedia(allMedia, true);
  });
}

sortBtn.addEventListener('click', () => {
  sortIndex = (sortIndex + 1) % SORT_MODES.length;
  const mode = SORT_MODES[sortIndex];
  currentSort = mode.key;
  sortBtn.replaceChildren(makeSortSvg(mode.key));
  sortBtn.title = mode.title;
  sortBtn.classList.toggle('active', mode.key !== 'default');
  renderMedia(allMedia, true);
});

listViewBtn.addEventListener('click', () => {
  if (currentView === 'list') return;
  currentView = 'list';
  listViewBtn.classList.add('active');
  gridViewBtn.classList.remove('active');
  renderMedia(allMedia, true);
});

gridViewBtn.addEventListener('click', () => {
  if (currentView === 'grid') return;
  currentView = 'grid';
  gridViewBtn.classList.add('active');
  listViewBtn.classList.remove('active');
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
        btn.replaceChildren(makeCheckSvg(), document.createTextNode('Saved'));
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

// Preview activation zone — center 50% of thumbnail
const PREVIEW_ZONE_RATIO = 0.5; // 50% of thumb dimensions
let previewZoneEl = null;
let lastHoverThumb = null;

function isInCenterZone(mouseX, mouseY, thumbRect) {
  const insetX = thumbRect.width * (1 - PREVIEW_ZONE_RATIO) / 2;
  const insetY = thumbRect.height * (1 - PREVIEW_ZONE_RATIO) / 2;
  return (
    mouseX >= thumbRect.left + insetX &&
    mouseX <= thumbRect.right - insetX &&
    mouseY >= thumbRect.top + insetY &&
    mouseY <= thumbRect.bottom - insetY
  );
}

function showPreviewZone(thumb) {
  if (lastHoverThumb === thumb && previewZoneEl) return;
  hidePreviewZone();
  lastHoverThumb = thumb;
  const zone = document.createElement('div');
  zone.className = 'preview-zone';
  // Position zone as an overlay inside the media-item, over the thumb
  thumb.parentElement.style.position = 'relative';
  zone.style.left = (thumb.offsetLeft + thumb.offsetWidth * (1 - PREVIEW_ZONE_RATIO) / 2) + 'px';
  zone.style.top = (thumb.offsetTop + thumb.offsetHeight * (1 - PREVIEW_ZONE_RATIO) / 2) + 'px';
  zone.style.width = (thumb.offsetWidth * PREVIEW_ZONE_RATIO) + 'px';
  zone.style.height = (thumb.offsetHeight * PREVIEW_ZONE_RATIO) + 'px';
  thumb.parentElement.appendChild(zone);
  previewZoneEl = zone;
}

function hidePreviewZone() {
  if (previewZoneEl) {
    previewZoneEl.remove();
    previewZoneEl = null;
  }
  lastHoverThumb = null;
}

mediaListEl.addEventListener('mousemove', (e) => {
  // Ignore when over action buttons
  if (e.target.closest('.save-btn') || e.target.closest('.copy-btn') || e.target.closest('.open-tab-btn') || e.target.closest('.search-btn')) {
    cancelPendingPreview();
    hidePreview();
    hidePreviewZone();
    return;
  }

  const item = e.target.closest('.media-item');
  if (!item) {
    cancelPendingPreview();
    hidePreviewZone();
    return;
  }

  const thumb = item.querySelector('.media-thumb');
  if (!thumb) {
    hidePreviewZone();
    return;
  }

  const thumbRect = thumb.getBoundingClientRect();
  const inZone = isInCenterZone(e.clientX, e.clientY, thumbRect);

  // Show the golden zone indicator whenever hovering the item
  showPreviewZone(thumb);
  previewZoneEl?.classList.toggle('active', inZone);

  if (inZone) {
    // Start preview timer if not already pending
    if (!hoverTimer && !activePreviewItem) {
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        const url = item.dataset.url;
        if (!url || !item.isConnected) return;
        const mediaItem = getFiltered().find((m) => m.url === url);
        if (mediaItem) showPreview(mediaItem, item);
      }, HOVER_DELAY_MS);
    }
  } else {
    // Moved out of center zone — cancel pending preview but keep existing one
    if (hoverTimer) {
      cancelPendingPreview();
    }
  }
}, true);

mediaListEl.addEventListener('mouseleave', (e) => {
  const item = e.target.closest('.media-item');
  if (!item) return;

  const goingTo = e.relatedTarget;
  if (goingTo && item.contains(goingTo) && !goingTo.closest('.save-btn') && !goingTo.closest('.copy-btn') && !goingTo.closest('.open-tab-btn') && !goingTo.closest('.search-btn')) return;

  cancelPendingPreview();
  hidePreview();
  hidePreviewZone();
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

function findMediaIndexByUrl(filtered, url) {
  const norm = normalizeForDedup(url);
  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i].url === url || normalizeForDedup(filtered[i].url) === norm) return i;
  }
  return -1;
}

async function tryFocusContextMenuImage() {
  let url;
  try {
    const result = await chrome.storage.session.get('contextMenuFocusUrl');
    url = result.contextMenuFocusUrl;
    if (!url) return;
    // Do not remove here: init() may call us again after re-render with fresh media.
  } catch {
    return;
  }
  const filtered = getFiltered();
  const focusIndex = findMediaIndexByUrl(filtered, url);
  if (focusIndex < 0) return;

  const viewport = mediaListEl.querySelector('.virtual-list-viewport');
  if (viewport) {
    viewport.scrollTop = Math.max(0, focusIndex * VIRTUAL_ROW_HEIGHT - 20);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const row = viewport.querySelector('.media-item[data-index="' + focusIndex + '"]');
        if (row) {
          row.classList.add('media-item-context-focus');
          setTimeout(() => row.classList.remove('media-item-context-focus'), 2500);
        }
      });
    });
  } else {
    const rows = mediaListEl.querySelectorAll('.media-item');
    const row = rows[focusIndex];
    if (row) {
      row.classList.add('media-item-context-focus');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => row.classList.remove('media-item-context-focus'), 2500);
    }
  }
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    activeTabId = tab.id;

    activePageUrl = canonicalUrl(tab.url);
    const pageUrl = activePageUrl;

    await loadUiPrefs();
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
      await tryFocusContextMenuImage();
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
      await tryFocusContextMenuImage();
    } else if (!cached) {
      emptyStateEl.classList.remove('hidden');
      summary.textContent = 'Could not scan this page';
    }

    // Adaptive polling: now a safety net since content script pushes updates.
    // Faster initial burst (catch injection timing), then relaxed fallback.
    const POLL_FAST_MS = 1000;
    const POLL_SLOW_MS = 4000;
    const POLL_FAST_DURATION_MS = 15 * 1000;
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

    // Clear context-menu focus URL once we're done so the next open doesn't reuse it.
    await chrome.storage.session.remove('contextMenuFocusUrl');
  } catch {
    loadingEl.classList.add('hidden');
    if (!allMedia.length) emptyStateEl.classList.remove('hidden');
  }
}

init();

// Media Link Saver — Options Page
// All UI built via DOM APIs. Uses chrome.storage.sync.

const DEFAULTS = {
  cacheTtlMinutes: 5,
  maxConcurrent: 4,
  excludePatterns: '',
};

function getOptionKeys() {
  return Object.keys(DEFAULTS);
}

function loadOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(getOptionKeys(), (stored) => {
      resolve({ ...DEFAULTS, ...stored });
    });
  });
}

function saveOptions(options) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(options, resolve);
  });
}

const app = document.getElementById('app');

const header = document.createElement('header');
const h1 = document.createElement('h1');
h1.textContent = 'Media Link Saver — Options';
header.appendChild(h1);

const form = document.createElement('form');
form.id = 'options-form';

const cacheSection = document.createElement('section');
cacheSection.className = 'options-section';
const cacheLabel = document.createElement('label');
cacheLabel.textContent = 'Cache TTL (minutes)';
cacheLabel.htmlFor = 'cache-ttl';
const cacheSelect = document.createElement('select');
cacheSelect.id = 'cache-ttl';
cacheSelect.name = 'cacheTtlMinutes';
for (const val of [1, 5, 15, 30]) {
  const opt = document.createElement('option');
  opt.value = String(val);
  opt.textContent = val + (val === 1 ? ' minute' : ' minutes');
  cacheSelect.appendChild(opt);
}
cacheSection.append(cacheLabel, cacheSelect);

const concurrentSection = document.createElement('section');
concurrentSection.className = 'options-section';
const concurrentLabel = document.createElement('label');
concurrentLabel.textContent = 'Max concurrent downloads';
concurrentLabel.htmlFor = 'max-concurrent';
const concurrentSelect = document.createElement('select');
concurrentSelect.id = 'max-concurrent';
concurrentSelect.name = 'maxConcurrent';
for (const val of [2, 4, 6, 8]) {
  const opt = document.createElement('option');
  opt.value = String(val);
  opt.textContent = String(val);
  concurrentSelect.appendChild(opt);
}
concurrentSection.append(concurrentLabel, concurrentSelect);

const excludeSection = document.createElement('section');
excludeSection.className = 'options-section';
const excludeLabel = document.createElement('label');
excludeLabel.textContent = 'Exclude URL patterns (one per line)';
excludeLabel.htmlFor = 'exclude-patterns';
const excludeHint = document.createElement('p');
excludeHint.className = 'options-hint';
excludeHint.textContent = 'URLs containing any of these strings (case-insensitive) are hidden from the list.';
const excludeTextarea = document.createElement('textarea');
excludeTextarea.id = 'exclude-patterns';
excludeTextarea.name = 'excludePatterns';
excludeTextarea.rows = 4;
excludeTextarea.placeholder = 'e.g. tracking.example.com\n/thumb/';
excludeSection.append(excludeLabel, excludeHint, excludeTextarea);

const actions = document.createElement('div');
actions.className = 'options-actions';
const saveBtn = document.createElement('button');
saveBtn.type = 'submit';
saveBtn.textContent = 'Save';
const status = document.createElement('span');
status.id = 'options-status';
status.className = 'options-status';
actions.append(saveBtn, status);

form.append(cacheSection, concurrentSection, excludeSection, actions);
app.append(header, form);

function showStatus(text, type = 'success') {
  status.textContent = text;
  status.className = 'options-status visible ' + type;
  setTimeout(() => {
    status.className = 'options-status';
  }, 2500);
}

async function init() {
  const opts = await loadOptions();
  cacheSelect.value = String(opts.cacheTtlMinutes);
  concurrentSelect.value = String(opts.maxConcurrent);
  excludeTextarea.value = opts.excludePatterns || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const options = {
    cacheTtlMinutes: parseInt(cacheSelect.value, 10),
    maxConcurrent: parseInt(concurrentSelect.value, 10),
    excludePatterns: excludeTextarea.value.trim(),
  };
  await saveOptions(options);
  showStatus('Options saved.');
});

init();

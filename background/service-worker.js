// Media Link Saver — Background Service Worker
// Handles download requests with concurrency control via Promise.allSettled.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'download') {
    downloadFile(message.url, message.filename).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadAll') {
    downloadAll(message.items).then(sendResponse);
    return true;
  }
});

function downloadFile(url, filename) {
  return new Promise((resolve) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true, downloadId });
      }
    });
  });
}

// Download with concurrency limit to avoid flooding the browser
const MAX_CONCURRENT = 4;

async function downloadAll(items) {
  let failed = 0;

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const batch = items.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map(({ url, filename }) => downloadFile(url, filename))
    );
    for (const r of results) {
      if (r.status === 'rejected' || !r.value?.success) failed++;
    }
  }

  return { success: true, total: items.length, failed };
}

// Media Link Saver — Background Service Worker
// Handles download requests with concurrency control via Promise.allSettled.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'download') {
    downloadFile(message.url, message.filename).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadBlob') {
    downloadBlob(message.blobUrl, message.filename, message.tabId).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadAll') {
    downloadAll(message.items, message.maxConcurrent).then(sendResponse);
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

// Fetch a blob URL from the page's MAIN world and trigger download via <a>.
// Previous approach converted to data URL, but Chrome's download API caps
// data URLs at ~2 MB — virtually all videos would silently fail.
async function downloadBlob(blobUrl, filename, tabId) {
  if (!tabId) {
    return { success: false, error: 'No active tab' };
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (url, fname) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
          return { ok: true };
        } catch {
          return null;
        }
      },
      args: [blobUrl, filename],
    });

    if (result?.ok) {
      return { success: true };
    }
    return { success: false, error: 'Cannot download blob content' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Download with concurrency limit to avoid flooding the browser
const DEFAULT_MAX_CONCURRENT = 4;

async function downloadAll(items, maxConcurrent) {
  const limit = Math.max(2, Math.min(8, maxConcurrent || DEFAULT_MAX_CONCURRENT));
  let failed = 0;
  const failedUrls = [];

  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const results = await Promise.allSettled(
      batch.map((item) => {
        if (item.blob && item.tabId) {
          return downloadBlob(item.url, item.filename, item.tabId);
        }
        return downloadFile(item.url, item.filename);
      })
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'rejected' || !r.value?.success) {
        failed++;
        failedUrls.push(batch[j].url);
      }
    }
    const completed = Math.min(i + batch.length, items.length);
    chrome.runtime.sendMessage({
      action: 'downloadProgress',
      completed,
      total: items.length,
    }).catch(() => { /* popup may be closed */ });
  }

  return { success: true, total: items.length, failed, failedUrls };
}

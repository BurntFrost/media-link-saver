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

// Fetch a blob URL from the page's MAIN world and download via data URL
async function downloadBlob(blobUrl, filename, tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (url) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      },
      args: [blobUrl],
    });

    if (!result) {
      return { success: false, error: 'Cannot download streaming video' };
    }

    return await downloadFile(result, filename);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Download with concurrency limit to avoid flooding the browser
const MAX_CONCURRENT = 4;

async function downloadAll(items) {
  let failed = 0;

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const batch = items.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map((item) => {
        if (item.blob && item.tabId) {
          return downloadBlob(item.url, item.filename, item.tabId);
        }
        return downloadFile(item.url, item.filename);
      })
    );
    for (const r of results) {
      if (r.status === 'rejected' || !r.value?.success) failed++;
    }
  }

  return { success: true, total: items.length, failed };
}

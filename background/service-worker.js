// Media Link Saver — Background Service Worker
// Handles download requests with concurrency control via Promise.allSettled.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'media-link-saver-open-image',
    title: 'Open image in new tab',
    contexts: ['image'],
  });
  chrome.contextMenus.create({
    id: 'media-link-saver-show-in-popup',
    title: 'Show in Media Link Saver',
    contexts: ['image'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.srcUrl;
  if (!url) return;

  if (info.menuItemId === 'media-link-saver-open-image') {
    chrome.tabs.create({ url });
    return;
  }

  if (info.menuItemId === 'media-link-saver-show-in-popup') {
    chrome.storage.session.set({ contextMenuFocusUrl: url });
    // Must call openPopup synchronously while the context-menu click still counts as a user gesture
    chrome.action.openPopup?.().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'download') {
    downloadFile(message.url, message.filename).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadBlob') {
    downloadBlob(message.blobUrl, message.filename, message.tabId).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadConverted') {
    downloadConverted(message.url, message.filename, message.format, message.tabId).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadAll') {
    downloadAll(message.items, message.maxConcurrent).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadZip') {
    downloadZip(message.items, message.tabId, message.convertFormat).then(sendResponse);
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

// Convert image format using OffscreenCanvas in MAIN world
async function downloadConverted(url, filename, format, tabId) {
  if (!tabId) return { success: false, error: 'No active tab' };
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (imgUrl, fname, mimeType) => {
        try {
          const res = await fetch(imgUrl);
          const blob = await res.blob();
          const bmp = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          const converted = await canvas.convertToBlob({ type: mimeType });
          const objUrl = URL.createObjectURL(converted);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      },
      args: [url, filename, format === 'jpg' ? 'image/jpeg' : 'image/png'],
    });
    if (result?.ok) return { success: true };
    // Fallback to normal download if conversion fails (CORS, etc.)
    return downloadFile(url, filename);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Download multiple items as a ZIP file
async function downloadZip(items, tabId, convertFormat) {
  if (!tabId) return { success: false, error: 'No active tab' };
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (itemList, format) => {
        // Minimal ZIP builder (stored mode, no compression)
        function crc32(data) {
          let crc = -1 >>> 0;
          for (let i = 0; i < data.length; i++) {
            let c = (crc ^ data[i]) & 0xFF;
            for (let k = 0; k < 8; k++) {
              c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crc = ((crc >>> 8) ^ c) >>> 0;
          }
          return (~crc) >>> 0;
        }

        function createZip(entries) {
          const encoder = new TextEncoder();
          const parts = [];
          const cdEntries = [];
          let offset = 0;

          for (const { name, blob } of entries) {
            const nameBytes = encoder.encode(name);
            const data = new Uint8Array(blob);
            const crc = crc32(data);
            const header = new Uint8Array(30 + nameBytes.length);
            const dv = new DataView(header.buffer);
            dv.setUint32(0, 0x04034b50, true); // local file header sig
            dv.setUint16(4, 10, true); // version
            dv.setUint16(8, 0, true); // compression (stored)
            dv.setUint32(14, crc, true);
            dv.setUint32(18, data.length, true); // compressed size
            dv.setUint32(22, data.length, true); // uncompressed size
            dv.setUint16(26, nameBytes.length, true);
            header.set(nameBytes, 30);
            parts.push(header, data);
            cdEntries.push({ name: nameBytes, offset, crc, size: data.length });
            offset += header.length + data.length;
          }

          const cdStart = offset;
          for (const { name, offset: fOffset, crc, size } of cdEntries) {
            const cd = new Uint8Array(46 + name.length);
            const cdv = new DataView(cd.buffer);
            cdv.setUint32(0, 0x02014b50, true); // central dir sig
            cdv.setUint16(4, 20, true); // version made by
            cdv.setUint16(6, 10, true); // version needed
            cdv.setUint16(10, 0, true); // compression
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, size, true);
            cdv.setUint32(24, size, true);
            cdv.setUint16(28, name.length, true);
            cdv.setUint32(42, fOffset, true);
            cd.set(name, 46);
            parts.push(cd);
            offset += cd.length;
          }

          const eocd = new Uint8Array(22);
          const eocdv = new DataView(eocd.buffer);
          eocdv.setUint32(0, 0x06054b50, true); // EOCD sig
          eocdv.setUint16(8, cdEntries.length, true);
          eocdv.setUint16(10, cdEntries.length, true);
          eocdv.setUint32(12, offset - cdStart, true);
          eocdv.setUint32(16, cdStart, true);
          parts.push(eocd);

          return new Blob(parts, { type: 'application/zip' });
        }

        const entries = [];
        for (const item of itemList) {
          try {
            const res = await fetch(item.url);
            let blob = await res.blob();
            if (format !== 'original' && item.type === 'image' && blob.type.startsWith('image/')) {
              const bmp = await createImageBitmap(blob);
              const canvas = new OffscreenCanvas(bmp.width, bmp.height);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(bmp, 0, 0);
              const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
              blob = await canvas.convertToBlob({ type: mimeType });
            }
            const arr = await blob.arrayBuffer();
            entries.push({ name: item.filename, blob: arr });
          } catch { /* skip failed fetches */ }
        }

        if (entries.length === 0) return { ok: false, error: 'No files fetched' };

        const zipBlob = createZip(entries);
        const objUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = 'media-link-saver.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
        return { ok: true, count: entries.length };
      },
      args: [items, convertFormat || 'original'],
    });
    if (result?.ok) return { success: true, count: result.count };
    return { success: false, error: result?.error || 'ZIP creation failed' };
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

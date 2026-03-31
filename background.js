// background.js — Service worker for YT DeClicker v3
// Handles cross-origin downloads that content scripts can't make
// due to YouTube's CSP blocking fetches to external domains.
//
// Uses chrome.storage.local as a binary transfer bridge:
// 1. Service worker downloads file → stores base64 in chrome.storage.local
// 2. Content script reads from chrome.storage.local → decodes to ArrayBuffer
// This avoids the message-size limit of chrome.runtime.sendMessage.
// chrome.storage.local is used (not session) because unlimitedStorage applies to it.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "proxyDownload") {
    handleDownload(msg, sender)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open
  }
});

// Only allow downloads from the trusted CDN domain
const ALLOWED_ORIGINS = ["https://cdn.mezon.ai"];

async function handleDownload(msg, sender) {
  const { url, storageKey, requestId } = msg;
  const tabId = sender.tab?.id;

  // Security: validate URL against allowlist to prevent open proxy abuse
  const parsedUrl = new URL(url);
  if (!ALLOWED_ORIGINS.some(origin => parsedUrl.origin === origin)) {
    throw new Error("URL not in allowed origins: " + parsedUrl.origin);
  }

  const resp = await fetchWithRetry(url, 3);
  const contentLength = parseInt(resp.headers.get("content-length") || "0");
  const reader = resp.body?.getReader();

  let bytes;
  if (reader && contentLength > 0 && tabId) {
    // Stream with progress
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Send progress to content script (small messages, no binary)
      try {
        chrome.tabs.sendMessage(tabId, {
          type: "downloadProgress",
          requestId,
          progress: Math.round((received / contentLength) * 100),
        });
      } catch (e) {}
    }
    const full = new Uint8Array(received);
    let pos = 0;
    for (const chunk of chunks) { full.set(chunk, pos); pos += chunk.length; }
    bytes = full;
  } else {
    const buf = await resp.arrayBuffer();
    bytes = new Uint8Array(buf);
  }

  // Convert to base64 for transfer via session storage
  // Process in 32KB chunks to avoid call stack overflow on btoa
  const CHUNK_SIZE = 32768;
  let b64 = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    b64 += String.fromCharCode.apply(null, slice);
  }
  const base64 = btoa(b64);

  // Store in chrome.storage.local (unlimitedStorage permission removes quota)
  // Using local instead of session because session has a 10MB quota that
  // can't be expanded, and our files are >10MB base64-encoded.
  await chrome.storage.local.set({ [storageKey]: base64 });

  return { ok: true, storageKey, size: bytes.length };
}

async function fetchWithRetry(url, retries) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return resp;
      lastError = new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries - 1) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

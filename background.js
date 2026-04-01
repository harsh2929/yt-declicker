// background.js — Service worker for YT DeClicker v3
//
// Download architecture:
//   proxyDownload  — called by content script on YouTube (uses tab for progress)
//   downloadDfDirect — called by popup from any page (broadcasts progress to popup)
//
// Settings are stored in chrome.storage.local so popup can read/write them
// without needing a content script (i.e. even when not on YouTube).

const GITHUB_REPO   = "harsh2929/yt-declicker";
const RELEASES_URL  = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;

// ─── Update Check ─────────────────────────────────────────────────────────────
// Runs once per browser session (on service worker startup).
// Compares manifest version with the latest GitHub release tag.
// Stores result in chrome.storage.local so the popup can show a banner instantly.
chrome.runtime.onInstalled.addListener(checkForUpdate);
checkForUpdate(); // also check on SW wake

async function checkForUpdate() {
  try {
    const { version } = chrome.runtime.getManifest();
    const resp = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    if (!latest) return;
    const hasUpdate = compareVersions(latest, version) > 0;
    await chrome.storage.local.set({
      ytdc_update_available: hasUpdate,
      ytdc_update_version:   latest,
      ytdc_update_url:       RELEASES_PAGE,
    });
    if (hasUpdate) broadcastToPopup({ type: "updateAvailable", version: latest, url: RELEASES_PAGE });
  } catch (e) {
    // Network unavailable — silently ignore
  }
}

// Returns >0 if a > b, <0 if a < b, 0 if equal  (semver without pre-release)
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const DF3_CDN = "https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3";
const DF3_WASM_URL  = `${DF3_CDN}/v2/pkg/df_bg.wasm`;
const DF3_MODEL_URL = `${DF3_CDN}/v2/models/DeepFilterNet3_onnx.tar.gz`;
const ALLOWED_ORIGINS = ["https://cdn.mezon.ai"];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  let promise;

  if (msg.action === "proxyDownload") {
    // Original path: content script on YouTube triggers this
    promise = handleProxyDownload(msg, sender.tab?.id);

  } else if (msg.action === "downloadDfDirect") {
    // New path: popup (any page) triggers this; progress goes to popup via broadcast
    promise = handleDfDirectDownload();

  } else if (msg.action === "deleteDfDirect") {
    // Mark deleted + clear staged data so content script won't re-import on next load
    promise = chrome.storage.local
      .set({ ytdc_df_downloaded: false })
      .then(() => chrome.storage.local.remove([
        "_df3_wasm_transfer", "_df3_model_transfer", "ytdc_df_staged"
      ]))
      .then(() => ({ ok: true }));

  } else {
    return false; // not our message
  }

  promise
    .then(result => sendResponse(result))
    .catch(e    => sendResponse({ ok: false, error: e.message }));
  return true; // keep channel open for async response
});

// ─── Shared download + base64-encode helper ───────────────────────────────────
// tabId: if provided, also sends progress to the YouTube tab (for content script path)
// progressCb: called with (pct) for each chunk received
async function downloadToStorage(url, storageKey, tabId, progressCb) {
  const parsedUrl = new URL(url);
  if (!ALLOWED_ORIGINS.some(o => parsedUrl.origin === o)) {
    throw new Error("URL not in allowed origins: " + parsedUrl.origin);
  }

  const resp = await fetchWithRetry(url, 3);
  const contentLength = parseInt(resp.headers.get("content-length") || "0");
  const reader = resp.body?.getReader();

  let bytes;
  if (reader && contentLength > 0) {
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const pct = Math.round((received / contentLength) * 100);
      if (progressCb) progressCb(pct);
      // Content-script path: also forward to the YouTube tab
      if (tabId) {
        try {
          chrome.tabs.sendMessage(tabId, {
            type: "downloadProgress",
            requestId: storageKey,
            progress: pct,
          });
        } catch (e) {}
      }
    }
    bytes = new Uint8Array(received);
    let pos = 0;
    for (const chunk of chunks) { bytes.set(chunk, pos); pos += chunk.length; }
  } else {
    bytes = new Uint8Array(await resp.arrayBuffer());
  }

  // Base64-encode in 32 KB slices to avoid call-stack overflow
  const CHUNK = 32768;
  let b64str = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    b64str += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  await chrome.storage.local.set({ [storageKey]: btoa(b64str) });
  return { ok: true, storageKey, size: bytes.length };
}

// ─── Original proxy-download path (content script → background) ──────────────
async function handleProxyDownload(msg, tabId) {
  const { url, storageKey, requestId } = msg;
  return downloadToStorage(url, storageKey, tabId, null);
}

// ─── Direct download path (popup → background) ───────────────────────────────
async function handleDfDirectDownload() {
  // WASM file — progress 0–30% in popup bar
  await downloadToStorage(DF3_WASM_URL, "_df3_wasm_transfer", null, (pct) => {
    broadcastToPopup({ type: "dfProgress", stage: "wasm", progress: pct });
  });

  // Model file — progress 30–100% in popup bar
  await downloadToStorage(DF3_MODEL_URL, "_df3_model_transfer", null, (pct) => {
    broadcastToPopup({ type: "dfProgress", stage: "model", progress: pct });
  });

  // Mark as staged so content script imports to IndexedDB on next YouTube load
  await chrome.storage.local.set({
    ytdc_df_downloaded: true,
    ytdc_df_staged: true,
  });

  return { ok: true };
}

function broadcastToPopup(msg) {
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) {}
}

// ─── Fetch with exponential-backoff retry ─────────────────────────────────────
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

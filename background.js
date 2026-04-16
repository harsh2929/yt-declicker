// background.js — Service worker for Ripple Wave v3
//
// Responsibilities:
//   1. Check GitHub releases for updates.
//   2. Clean up legacy DeepFilter download state from older builds.

const GITHUB_REPO   = "harsh2929/ripple-wave";
const RELEASES_URL  = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;
const LEGACY_DF_STORAGE_KEYS = [
  "_df3_wasm_transfer",
  "_df3_model_transfer",
  "ytdc_df_staged",
  "ytdc_df_downloaded",
];

// ─── Update Check ─────────────────────────────────────────────────────────────
// Runs once per browser session (on worker startup) and after installs.
chrome.runtime.onInstalled.addListener(() => {
  checkForUpdate(true);
  clearLegacyDfStorage();
});
chrome.runtime.onStartup.addListener(() => {
  checkForUpdate(false);
  clearLegacyDfStorage();
});
checkForUpdate(false); // also check on SW wake (throttled)
// Legacy cleanup runs from the lifecycle listeners above — no need to repeat
// it at top-level since onInstalled/onStartup always fire on SW wake.

async function checkForUpdate(force) {
  try {
    // Throttle: skip if checked within the last 6 hours (unless forced by onInstalled)
    if (!force) {
      const { ytdc_last_update_check } = await chrome.storage.local.get("ytdc_last_update_check");
      if (ytdc_last_update_check && Date.now() - ytdc_last_update_check < 6 * 60 * 60 * 1000) return;
    }
    await chrome.storage.local.set({ ytdc_last_update_check: Date.now() });

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

// Returns >0 if a > b, <0 if a < b, 0 if equal (semver without pre-release)
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function broadcastToPopup(msg) {
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) {}
}

// ─── Keyboard Shortcut Toggle ─────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-filter") return;
  const { ytdc_active } = await chrome.storage.local.get("ytdc_active");
  const next = !ytdc_active;
  await chrome.storage.local.set({ ytdc_active: next });
  // Sync to chrome.storage.sync if available
  try { await chrome.storage.sync?.set({ ytdc_active: next }); } catch (_) {}
  updateBadge(next);
  // Notify content script on active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: next ? "activate" : "deactivate" }).catch(() => {});
  }
});

// ─── Badge State ──────────────────────────────────────────────────────────────
function updateBadge(isActive) {
  chrome.action.setBadgeText({ text: isActive ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: isActive ? "#4ade80" : "#6b7280" });
  chrome.action.setBadgeTextColor({ color: isActive ? "#052e16" : "#ffffff" });
}

// Restore badge on startup
chrome.storage.local.get("ytdc_active", (result) => {
  updateBadge(!!result.ytdc_active);
});

// Keep badge in sync when storage changes (from popup or content script)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.ytdc_active !== undefined) {
    updateBadge(!!changes.ytdc_active.newValue);
  }
});

async function clearLegacyDfStorage() {
  try {
    await chrome.storage.local.remove(LEGACY_DF_STORAGE_KEYS);
  } catch (e) {
    // Ignore storage cleanup failures during worker startup.
  }
}

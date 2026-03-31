// popup.js — YT DeClicker v3 (no inline scripts, CSP-safe)

const $ = (id) => document.getElementById(id);

const toggle = $("toggle");
const intensitySlider = $("intensity");
const intensityVal = $("intensityVal");
const intensityLabel = $("intensityLabel");
const statusEl = $("status");
const engineCards = document.querySelectorAll(".engine-card");
const dfPanel = $("dfPanel");
const dfIcon = $("dfIcon");
const dfText = $("dfText");
const dfBtn = $("dfBtn");
const dfDeleteBtn = $("dfDeleteBtn");
const dfProgress = $("dfProgress");
const dfProgressLabel = $("dfProgressLabel");
const dfBarFill = $("dfBarFill");
const eqPresets = $("eqPresets");
const presetBtns = document.querySelectorAll(".btn-preset");
const infoText = $("infoText");
const themeToggle = $("themeToggle");
const engineGrid = document.querySelector(".engine-grid");
const bugReportBtn = $("bugReportBtn");

let currentMode = "eq";
let dfDownloaded = false;
let progressListener = null;
let connected = false; // tracks if content script is reachable

const MODE_INFO = {
  eq: {
    desc: "Targets 1\u20136 kHz click transients. ~70% removal. Voice stays clean.",
    label: "INTENSITY",
  },
  ml: {
    desc: "RNNoise: 48kHz RNN, 150KB bundled. Great for clicks + fan noise.",
    label: "OUTPUT BOOST",
  },
  deep: {
    desc: "DeepFilterNet3 full-band deep filtering. Best quality. ~2MB one-time download.",
    label: "SUPPRESSION",
  },
};

// ─── Storage helpers ───
// chrome.storage.local is accessible from popup, background, and content script.
// We use it as the source of truth so the popup works even when off YouTube.
function loadFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["ytdc_active", "ytdc_mode", "ytdc_intensity", "ytdc_df_downloaded"],
      (result) => {
        resolve({
          active: result.ytdc_active ?? false,
          mode: result.ytdc_mode ?? "eq",
          intensity: result.ytdc_intensity ?? 70,
          dfDownloaded: result.ytdc_df_downloaded ?? false,
          hooked: false,
        });
      }
    );
  });
}

function saveToStorage(updates) {
  chrome.storage.local.set(updates).catch(() => {});
}

// ─── Theme ───
function loadTheme() {
  const saved = localStorage.getItem("ytdc_theme");
  const theme = saved || "dark";
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "\u2600" : "\u263D";
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themeToggle.textContent = next === "dark" ? "\u2600" : "\u263D";
  localStorage.setItem("ytdc_theme", next);
});

// ─── Connection Status UI ───
function showDisconnected() {
  connected = false;
  statusEl.textContent = "NO SCRIPT";
  statusEl.className = "status-badge no-video";
  infoText.textContent =
    "Content script not loaded. Click \u201cInject & Retry\u201d or refresh the YouTube tab.";
  $("injectRow").style.display = "flex";
}

function showOffline() {
  // Not on YouTube — expected state, settings still work via storage
  connected = false;
  statusEl.textContent = "OFFLINE";
  statusEl.className = "status-badge no-video";
  $("injectRow").style.display = "none";
}

function hideInjectRow() {
  $("injectRow").style.display = "none";
}

// ─── Messaging ───
// sendMsg always calls cb(resp) — resp is null on error.
// Also distinguishes "on YouTube but no script" from "not on YouTube".
function sendMsg(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) {
      showOffline();
      if (cb) cb(null);
      return;
    }
    const tab = tabs[0];
    const isYouTube = tab.url && tab.url.includes("youtube.com");

    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      if (chrome.runtime.lastError) {
        if (isYouTube) {
          showDisconnected();
        } else {
          showOffline();
        }
        if (cb) cb(null);
        return;
      }
      connected = true;
      hideInjectRow();
      if (cb) cb(resp);
    });
  });
}

// Inject content script programmatically and retry connection
async function injectAndRetry() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (!tab.url || !tab.url.includes("youtube.com")) {
    statusEl.textContent = "NOT YT";
    statusEl.className = "status-badge no-video";
    infoText.textContent = "Open a YouTube video tab first.";
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    // Wait for script to initialize
    setTimeout(refreshState, 500);
  } catch (e) {
    console.warn("[YT DeClicker] Injection failed:", e.message);
    infoText.textContent = "Injection failed. Try refreshing the YouTube tab.";
  }
}

// ─── UI Updates ───
function updateModeUI(modeVal, downloaded) {
  currentMode = modeVal;
  dfDownloaded = downloaded;

  engineCards.forEach((c) => {
    c.classList.toggle("active", c.dataset.mode === modeVal);
  });

  const info = MODE_INFO[modeVal];
  infoText.textContent = info.desc;
  intensityLabel.textContent = info.label;

  // DeepFilter panel
  dfPanel.classList.toggle("show", modeVal === "deep");
  eqPresets.style.display = modeVal === "eq" ? "" : "none";

  if (modeVal === "deep") {
    if (downloaded) {
      dfPanel.classList.add("downloaded");
      dfIcon.textContent = "\u2713";
      dfText.textContent = "Model ready";
      dfBtn.style.display = "none";
      dfDeleteBtn.style.display = "";
    } else {
      dfPanel.classList.remove("downloaded");
      dfIcon.textContent = "\u25CB";
      dfText.textContent = "Model not downloaded";
      dfBtn.style.display = "";
      dfBtn.disabled = false;
      dfBtn.textContent = "DOWNLOAD MODEL";
      dfDeleteBtn.style.display = "none";
      dfProgress.classList.remove("show");
    }
  }
}

function updateUI(state) {
  if (!state) return;

  // Power button
  if (state.active) {
    toggle.textContent = "ON";
    toggle.classList.add("on");
  } else {
    toggle.textContent = "OFF";
    toggle.classList.remove("on");
  }

  // Status badge — only update when connected to content script,
  // otherwise the status was already set by showOffline/showDisconnected.
  if (connected) {
    if (!state.hooked) {
      statusEl.textContent = "NO VIDEO";
      statusEl.className = "status-badge no-video";
    } else if (state.active) {
      statusEl.textContent = "ACTIVE";
      statusEl.className = "status-badge on";
    } else {
      statusEl.textContent = "OFF";
      statusEl.className = "status-badge";
    }
  }

  intensitySlider.value = state.intensity;
  intensityVal.textContent = state.intensity;

  updateModeUI(state.mode, state.dfDownloaded);

  presetBtns.forEach((btn) => {
    btn.classList.toggle(
      "active",
      parseInt(btn.dataset.val) === state.intensity
    );
  });
}

// ─── State Refresh ───
// Renders from chrome.storage.local immediately (works offline),
// then enriches with live data from content script if available.
async function refreshState() {
  const stored = await loadFromStorage();
  updateUI(stored);

  sendMsg({ action: "getState" }, (resp) => {
    if (resp) {
      const liveState = {
        active: resp.active,
        mode: resp.mode,
        intensity: resp.intensity,
        hooked: resp.hooked,
        dfDownloaded: resp.dfDownloaded || stored.dfDownloaded,
      };
      updateUI(liveState);
      // Keep storage in sync with live content script state
      saveToStorage({
        ytdc_active: resp.active,
        ytdc_mode: resp.mode,
        ytdc_intensity: resp.intensity,
        ytdc_df_downloaded: liveState.dfDownloaded,
      });
    }
  });
}

// ─── Init ───
loadTheme();
refreshState();
// Retry once after a short delay in case content script is still initializing
setTimeout(() => { if (!connected) refreshState(); }, 800);

// Trigger stat bar fill animation shortly after popup opens
setTimeout(() => { engineGrid.classList.add("bars-ready"); }, 80);

// ─── Inject Button ───
$("injectBtn").addEventListener("click", injectAndRetry);

// ─── Power Toggle ───
toggle.addEventListener("click", () => {
  const willActivate = !toggle.classList.contains("on");
  const action = willActivate ? "activate" : "deactivate";

  // Always persist to storage — takes effect on next YouTube load if offline
  saveToStorage({ ytdc_active: willActivate });

  // Apply immediately to content script if available
  sendMsg({ action }, (resp) => {
    if (resp) {
      setTimeout(refreshState, 200);
    } else {
      // No content script — update UI directly
      toggle.textContent = willActivate ? "ON" : "OFF";
      toggle.classList.toggle("on", willActivate);
    }
  });
});

// ─── Engine Selection ───
engineCards.forEach((card) => {
  card.addEventListener("click", () => {
    const newMode = card.dataset.mode;
    if (newMode === currentMode) return;

    // If deep mode selected but not downloaded, show panel but don't switch engine
    if (newMode === "deep" && !dfDownloaded) {
      updateModeUI("deep", false);
      return;
    }

    // Persist to storage and update UI immediately (no content script needed)
    saveToStorage({ ytdc_mode: newMode });
    updateModeUI(newMode, dfDownloaded);

    // Also apply to content script if available
    sendMsg({ action: "setMode", value: newMode }, (resp) => {
      if (resp) setTimeout(refreshState, 200);
    });
  });
});

// ─── DeepFilter Download ───
// Sends directly to background service worker — works on any page, not just YouTube.
dfBtn.addEventListener("click", () => {
  dfBtn.disabled = true;
  dfBtn.textContent = "DOWNLOADING...";
  dfProgress.classList.add("show");
  dfProgressLabel.textContent = "Downloading WASM engine...";
  dfBarFill.style.width = "0%";
  dfBarFill.style.background = "";

  // Remove any existing progress listener before adding a new one
  if (progressListener) {
    chrome.runtime.onMessage.removeListener(progressListener);
  }

  // Track progress broadcasts from background
  progressListener = function (msg) {
    if (msg.type === "dfProgress") {
      if (msg.stage === "wasm") {
        dfProgressLabel.textContent = "Downloading WASM engine...";
        dfBarFill.style.width = msg.progress * 0.3 + "%";
      } else if (msg.stage === "model") {
        dfProgressLabel.textContent = "Downloading model... " + msg.progress + "%";
        dfBarFill.style.width = 30 + msg.progress * 0.7 + "%";
      }
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  // Direct to background — bypasses content script entirely
  chrome.runtime.sendMessage({ action: "downloadDfDirect" }, (resp) => {
    if (progressListener) {
      chrome.runtime.onMessage.removeListener(progressListener);
      progressListener = null;
    }

    if (resp && resp.ok) {
      dfDownloaded = true;
      // Show "Model loaded!" briefly, then collapse the progress bar
      dfProgressLabel.textContent = "Model loaded!";
      dfBarFill.style.width = "100%";
      setTimeout(() => dfProgress.classList.remove("show"), 5000);
      updateModeUI("deep", true);
      // Persist download flag and new mode
      saveToStorage({ ytdc_df_downloaded: true, ytdc_mode: "deep" });
      // If on YouTube, tell the content script to import staged assets from
      // storage into its IndexedDB, then switch to deep mode
      sendMsg({ action: "importStaged" }, () => {
        sendMsg({ action: "setMode", value: "deep" }, () => {
          setTimeout(refreshState, 200);
        });
      });
    } else {
      dfBtn.disabled = false;
      dfBtn.textContent = "RETRY DOWNLOAD";
      dfProgressLabel.textContent =
        (resp && resp.error) || "Download failed — check connection";
      dfBarFill.style.width = "0%";
      dfBarFill.style.background = "var(--danger)";
    }
  });
});

// ─── Delete Model ───
// Sends directly to background — clears storage flags and staged transfer data.
dfDeleteBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "deleteDfDirect" }, (resp) => {
    if (!resp || !resp.ok) return;
    dfDownloaded = false;
    saveToStorage({ ytdc_df_downloaded: false, ytdc_mode: "ml" });
    updateModeUI("ml", false);
    // Also tell content script to clean up its IndexedDB and switch mode
    sendMsg({ action: "deleteDf" }, () => {
      sendMsg({ action: "setMode", value: "ml" }, () => {
        setTimeout(refreshState, 200);
      });
    });
  });
});

// ─── Intensity Slider ───
intensitySlider.addEventListener("input", () => {
  const val = parseInt(intensitySlider.value);
  intensityVal.textContent = val;
  saveToStorage({ ytdc_intensity: val });
  sendMsg({ action: "setIntensity", value: val });
  presetBtns.forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.val) === val);
  });
});

// ─── Presets ───
presetBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const val = parseInt(btn.dataset.val);
    intensitySlider.value = val;
    intensityVal.textContent = val;
    saveToStorage({ ytdc_intensity: val });
    sendMsg({ action: "setIntensity", value: val });
    presetBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ─── Bug Report ───
bugReportBtn.addEventListener("click", () => {
  const engineNames = { eq: "EQ Lite", ml: "RNNoise", deep: "DeepFilterNet3" };
  const subject = encodeURIComponent("YT DeClicker v3 — Bug Report");
  const body = encodeURIComponent(
    "Bug Report — YT DeClicker v3\n" +
    "─────────────────────────────\n" +
    "Engine:    " + (engineNames[currentMode] || currentMode) + "\n" +
    "Intensity: " + intensitySlider.value + "\n" +
    "Browser:   " + navigator.userAgent + "\n\n" +
    "Describe the issue:\n\n\n" +
    "Steps to reproduce:\n1. \n2. \n3. \n\n" +
    "Expected behaviour:\n\n" +
    "Actual behaviour:\n"
  );
  window.open("mailto:harshkumar09104@gmail.com?subject=" + subject + "&body=" + body);
});

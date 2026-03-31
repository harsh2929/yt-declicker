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
  infoText.textContent = "Content script not loaded. Click \u201cInject & Retry\u201d or refresh the YouTube tab.";
  // Show inject button
  $("injectRow").style.display = "flex";
}

function hideInjectRow() {
  $("injectRow").style.display = "none";
}

// ─── Messaging ───
// sendMsg always calls cb(resp) — resp is null on error
function sendMsg(msg, cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) {
      if (cb) cb(null);
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, msg, (resp) => {
      if (chrome.runtime.lastError) {
        // Content script not available
        showDisconnected();
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

  // Check if it's a YouTube tab
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
  if (!state) return; // null response = disconnected, already handled

  // Power button
  if (state.active) {
    toggle.textContent = "ON";
    toggle.classList.add("on");
  } else {
    toggle.textContent = "OFF";
    toggle.classList.remove("on");
  }

  // Status badge
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

function refreshState() {
  sendMsg({ action: "getState" }, (resp) => {
    updateUI(resp);
  });
}

// ─── Init ───
loadTheme();
refreshState();
// Retry once after a short delay in case content script is still initializing
setTimeout(() => { if (!connected) refreshState(); }, 800);

// ─── Inject Button ───
$("injectBtn").addEventListener("click", injectAndRetry);

// ─── Power Toggle ───
toggle.addEventListener("click", () => {
  const willActivate = !toggle.classList.contains("on");
  sendMsg({ action: willActivate ? "activate" : "deactivate" }, (resp) => {
    if (resp) setTimeout(refreshState, 200);
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

    sendMsg({ action: "setMode", value: newMode }, (resp) => {
      if (resp) {
        setTimeout(refreshState, 200);
      }
    });
  });
});

// ─── DeepFilter Download ───
dfBtn.addEventListener("click", () => {
  dfBtn.disabled = true;
  dfBtn.textContent = "DOWNLOADING...";
  dfProgress.classList.add("show");
  dfProgressLabel.textContent = "Downloading WASM engine...";
  dfBarFill.style.width = "0%";
  dfBarFill.style.background = "";

  sendMsg({ action: "downloadDf" }, (resp) => {
    // Remove progress listener when done
    if (progressListener) {
      chrome.runtime.onMessage.removeListener(progressListener);
      progressListener = null;
    }

    if (resp && resp.ok) {
      dfDownloaded = true;
      updateModeUI("deep", true);
      sendMsg({ action: "setMode", value: "deep" }, () => {
        setTimeout(refreshState, 200);
      });
    } else {
      dfBtn.disabled = false;
      dfBtn.textContent = "RETRY DOWNLOAD";
      dfProgressLabel.textContent = (resp && resp.error) || "Download failed — check connection";
      dfBarFill.style.width = "0%";
      dfBarFill.style.background = "var(--danger)";
    }
  });

  // Remove any existing progress listener before adding new one
  if (progressListener) {
    chrome.runtime.onMessage.removeListener(progressListener);
  }

  // Create and track progress listener
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
});

// ─── Delete Model ───
dfDeleteBtn.addEventListener("click", () => {
  sendMsg({ action: "deleteDf" }, (resp) => {
    if (!resp) return;
    dfDownloaded = false;
    sendMsg({ action: "setMode", value: "ml" }, () => {
      setTimeout(refreshState, 200);
    });
  });
});

// ─── Intensity Slider ───
intensitySlider.addEventListener("input", () => {
  const val = parseInt(intensitySlider.value);
  intensityVal.textContent = val;
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
    sendMsg({ action: "setIntensity", value: val });
    presetBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

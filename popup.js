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
const updateBanner = $("updateBanner");
const updateText   = $("updateText");
const updateLink   = $("updateLink");
const updateDismiss = $("updateDismiss");
const detectToggle = $("detectToggle");
const detectKeywords = $("detectKeywords");
const customKeywordsEl = $("customKeywords");
const channelsSection = $("channelsSection");
const channelsHeaderBtn = $("channelsHeaderBtn");
const channelsBody = $("channelsBody");
const chCurrentWrap = $("chCurrentWrap");
const chList = $("chList");
const chEmpty = $("chEmpty");

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

// ─── Update Banner ───
function showUpdateBanner(version, url) {
  updateText.textContent = `v${version} available`;
  updateLink.href = url;
  updateBanner.style.display = "flex";
}

function initUpdateBanner() {
  // Read cached result set by background service worker
  chrome.storage.local.get(
    ["ytdc_update_available", "ytdc_update_version", "ytdc_update_url", "ytdc_update_dismissed"],
    (result) => {
      if (result.ytdc_update_available && !result.ytdc_update_dismissed) {
        showUpdateBanner(result.ytdc_update_version, result.ytdc_update_url);
      }
    }
  );
  // Also listen for a live broadcast (if the check completes while popup is open)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "updateAvailable") showUpdateBanner(msg.version, msg.url);
  });
}

updateDismiss.addEventListener("click", () => {
  updateBanner.style.display = "none";
  // Remember dismiss until the next new version is found
  chrome.storage.local.set({ ytdc_update_dismissed: true });
});

// Reset dismissed flag whenever a new update_version is stored
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ytdc_update_version) {
    chrome.storage.local.set({ ytdc_update_dismissed: false });
  }
});

// ─── Channel rules ───
function _clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function _chColor(name) {
  const P = ["#4ade80","#60a5fa","#f472b6","#fb923c","#a78bfa","#34d399","#fbbf24","#38bdf8"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return P[Math.abs(h) % P.length];
}

function _makeAvatar(name, iconUrl) {
  const wrap = document.createElement("div");
  wrap.className = "ch-avatar";
  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      img.remove();
      wrap.textContent = (name[0] || "?").toUpperCase();
      wrap.style.background = _chColor(name);
    });
    wrap.appendChild(img);
  } else {
    wrap.textContent = (name[0] || "?").toUpperCase();
    wrap.style.background = _chColor(name);
  }
  return wrap;
}

function _makeRuleSeg(currentRule, onSelect) {
  const seg = document.createElement("div");
  seg.className = "rule-seg";
  [
    { r: "always", label: "ALWAYS"  },
    { r: "ask",    label: "ASK"     },
    { r: "never",  label: "EXCLUDE" },
  ].forEach(({ r, label }) => {
    const btn = document.createElement("button");
    btn.className = "rule-seg-btn" + (r === currentRule ? " rule-" + r : "");
    btn.textContent = label;
    btn.dataset.rule = r;
    btn.addEventListener("click", () => {
      seg.querySelectorAll(".rule-seg-btn").forEach((b) => {
        b.className = "rule-seg-btn" + (b.dataset.rule === r ? " rule-" + r : "");
      });
      onSelect(r);
    });
    seg.appendChild(btn);
  });
  return seg;
}

function _saveChannelRule(id, name, iconUrl, rule) {
  chrome.storage.local.get(["ytdc_channel_rules"], (res) => {
    const rules = res.ytdc_channel_rules || {};
    rules[id] = { name, iconUrl, rule };
    chrome.storage.local.set({ ytdc_channel_rules: rules }, () => renderChannelList(rules));
  });
}

function _removeChannelRule(id) {
  chrome.storage.local.get(["ytdc_channel_rules"], (res) => {
    const rules = res.ytdc_channel_rules || {};
    delete rules[id];
    chrome.storage.local.set({ ytdc_channel_rules: rules }, () => {
      renderChannelList(rules);
      // Re-render current channel strip without the saved rule
      if (_currentChInfo && _currentChInfo.id === id) {
        renderCurrentChannel(_currentChInfo, rules);
      }
    });
  });
}

let _currentChInfo = null;

function _buildChRow(id, name, iconUrl, rule, extraActions) {
  const row = document.createElement("div");
  row.className = "ch-row";
  row.appendChild(_makeAvatar(name, iconUrl));

  const nameEl = document.createElement("span");
  nameEl.className = "ch-name";
  nameEl.textContent = name;
  row.appendChild(nameEl);

  const actWrap = document.createElement("div");
  actWrap.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0";
  actWrap.appendChild(
    _makeRuleSeg(rule, (r) => _saveChannelRule(id, name, iconUrl, r))
  );
  if (extraActions) extraActions(actWrap, id, name, iconUrl);
  row.appendChild(actWrap);
  return row;
}

function renderChannelList(rules) {
  _clearEl(chList);
  const entries = Object.entries(rules || {});
  if (entries.length === 0) {
    chEmpty.style.display = "";
    return;
  }
  chEmpty.style.display = "none";

  const scroll = document.createElement("div");
  scroll.className = "ch-list-scroll";
  entries.forEach(([id, { name, iconUrl, rule }]) => {
    scroll.appendChild(
      _buildChRow(id, name, iconUrl, rule, (wrap, cId, cName, cIcon) => {
        const del = document.createElement("button");
        del.className = "ch-delete-btn";
        del.title = "Remove rule";
        del.textContent = "\u2715";
        del.addEventListener("click", () => _removeChannelRule(cId));
        wrap.appendChild(del);
      })
    );
  });
  chList.appendChild(scroll);
}

function renderCurrentChannel(info, rules) {
  _clearEl(chCurrentWrap);
  if (!info) { chCurrentWrap.style.display = "none"; return; }
  chCurrentWrap.style.display = "";

  const label = document.createElement("div");
  label.className = "ch-current-label";
  label.textContent = "Current video";
  chCurrentWrap.appendChild(label);

  const savedRule = (rules || {})[info.id]?.rule || null;
  chCurrentWrap.appendChild(
    _buildChRow(info.id, info.name, info.iconUrl, savedRule, savedRule
      ? (wrap, cId, cName, cIcon) => {
          const del = document.createElement("button");
          del.className = "ch-delete-btn";
          del.title = "Remove rule";
          del.textContent = "\u2715";
          del.addEventListener("click", () => _removeChannelRule(cId));
          wrap.appendChild(del);
        }
      : null
    )
  );

  const divider = document.createElement("div");
  divider.style.cssText = "height:1px;background:var(--border);margin:4px 0";
  chCurrentWrap.appendChild(divider);
}

function initChannels() {
  const expanded = localStorage.getItem("ytdc_channels_open") !== "false";
  if (expanded) channelsSection.classList.add("open");
  channelsHeaderBtn.setAttribute("aria-expanded", String(expanded));

  chrome.storage.local.get(["ytdc_channel_rules"], (res) => {
    const rules = res.ytdc_channel_rules || {};
    renderChannelList(rules);
    sendMsg({ action: "getChannelInfo" }, (resp) => {
      _currentChInfo = resp || null;
      renderCurrentChannel(_currentChInfo, rules);
      if (resp && localStorage.getItem("ytdc_channels_open") === null) {
        channelsSection.classList.add("open");
        channelsHeaderBtn.setAttribute("aria-expanded", "true");
      }
    });
  });
}

channelsHeaderBtn.addEventListener("click", () => {
  const isOpen = channelsSection.classList.toggle("open");
  channelsHeaderBtn.setAttribute("aria-expanded", String(isOpen));
  localStorage.setItem("ytdc_channels_open", String(isOpen));
});

// ─── Auto-detect ───
function setDetectToggleUI(on) {
  detectToggle.textContent = on ? "ON" : "OFF";
  detectToggle.setAttribute("aria-pressed", on ? "true" : "false");
  detectToggle.classList.toggle("on", on);
  detectKeywords.style.display = on ? "" : "none";
}

function initDetect() {
  chrome.storage.local.get(["ytdc_autodetect", "ytdc_custom_keywords"], (result) => {
    const on = result.ytdc_autodetect ?? true;
    setDetectToggleUI(on);
    customKeywordsEl.value = result.ytdc_custom_keywords || "";
  });
}

detectToggle.addEventListener("click", () => {
  const isOn = detectToggle.classList.contains("on");
  const next = !isOn;
  setDetectToggleUI(next);
  chrome.storage.local.set({ ytdc_autodetect: next }).catch(() => {});
});

// Debounced save for the keywords textarea
let _kwTimer = null;
customKeywordsEl.addEventListener("input", () => {
  clearTimeout(_kwTimer);
  _kwTimer = setTimeout(() => {
    chrome.storage.local.set({ ytdc_custom_keywords: customKeywordsEl.value }).catch(() => {});
  }, 600);
});

// ─── Init ───
loadTheme();
initUpdateBanner();
initChannels();
initDetect();
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

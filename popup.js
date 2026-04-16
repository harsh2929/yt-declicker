// popup.js — Ripple Wave v3 (no inline scripts, CSP-safe)

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
const dfNote = $("dfNote");
const eqPresets = $("eqPresets");
const presetBtns = document.querySelectorAll(".btn-preset");
const themeToggle = $("themeToggle");
const engineGrid = document.querySelector(".engine-grid");
const bugReportBtn = $("bugReportBtn");
const updateBanner = $("updateBanner");
const updateText   = $("updateText");
const updateLink   = $("updateLink");
const updateDismiss = $("updateDismiss");
const detectToggle = $("detectToggle");
const detectKeywords = $("detectKeywords");
const detectTopicsEl = $("detectTopics");
const customKeywordInput = $("customKeywordInput");
const channelsSection = $("channelsSection");
const channelsHeaderBtn = $("channelsHeaderBtn");
const channelsBody = $("channelsBody");
const chCurrentWrap = $("chCurrentWrap");
const chList = $("chList");
const chEmpty = $("chEmpty");

let currentMode = "eq";
let dfDownloaded = true;
let connected = false; // tracks if content script is reachable

const MODE_INFO = {
  eq:   { label: "INTENSITY"   },
  ml:   { label: "OUTPUT BOOST" },
  deep: { label: "SUPPRESSION"  },
};

// ─── Storage helpers ───
// chrome.storage.local is accessible from popup, background, and content script.
// We use it as the source of truth so the popup works even when off YouTube.
function loadFromStorage() {
  const fallback = () => new Promise((resolve) => {
    chrome.storage.local.get(
      ["ytdc_active", "ytdc_mode", "ytdc_intensity"],
      (result) => {
        resolve(result || {});
      }
    );
  });

  const load = globalThis.RippleWaveSettings?.getSettings
    ? globalThis.RippleWaveSettings.getSettings(["ytdc_active", "ytdc_mode", "ytdc_intensity"]).catch(fallback)
    : fallback();

  return Promise.resolve(load).then((result) => ({
    active: result.ytdc_active ?? false,
    mode: result.ytdc_mode ?? "eq",
    intensity: result.ytdc_intensity ?? 70,
    dfDownloaded: true,
    hooked: false,
  }));
}

function getSyncedSettings(keys) {
  if (globalThis.RippleWaveSettings?.getSettings) {
    return globalThis.RippleWaveSettings.getSettings(keys);
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function saveToStorage(updates, options = {}) {
  if (globalThis.RippleWaveSettings?.setSettings) {
    return globalThis.RippleWaveSettings.setSettings(updates, options).catch(() => {});
  }
  return chrome.storage.local.set(updates).catch(() => {});
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
function _isSupportedSite(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "reddit.com" ||
      hostname.endsWith(".reddit.com") ||
      hostname === "x.com" ||
      hostname.endsWith(".x.com") ||
      hostname === "twitter.com" ||
      hostname.endsWith(".twitter.com") ||
      hostname === "twitch.tv" ||
      hostname.endsWith(".twitch.tv") ||
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "fb.watch" ||
      hostname === "linkedin.com" ||
      hostname.endsWith(".linkedin.com") ||
      hostname === "kick.com" ||
      hostname.endsWith(".kick.com");
  } catch (e) {
    return false;
  }
}

function showDisconnected() {
  connected = false;
  statusEl.textContent = "NO SCRIPT";
  statusEl.className = "status-badge no-video";
  // status shown via badge only
  $("injectRow").style.display = "flex";
}

function showOffline() {
  connected = false;
  statusEl.textContent = "OFFLINE";
  statusEl.className = "status-badge no-video";
  $("injectRow").style.display = "none";
}

function hideInjectRow() {
  $("injectRow").style.display = "none";
}


// ─── Messaging ───
// sendMsg always calls cb(resp) — resp is null on error or timeout.
// Also distinguishes "on YouTube but no script" from "not on YouTube".
// A 3s timeout prevents the popup from hanging forever if the content script
// crashes or the async handler swallows an error.
const SEND_MSG_TIMEOUT_MS = 3000;
function sendMsg(msg, cb) {
  let cbCalled = false;
  const callOnce = (resp) => { if (cbCalled) return; cbCalled = true; if (cb) cb(resp); };

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]) {
      showOffline();
      callOnce(null);
      return;
    }
    const tab = tabs[0];
    const isSupportedSite = _isSupportedSite(tab.url);

    const timeoutId = setTimeout(() => {
      if (cbCalled) return;
      if (isSupportedSite) showDisconnected();
      else showOffline();
      callOnce(null);
    }, SEND_MSG_TIMEOUT_MS);

    chrome.tabs.sendMessage(tab.id, msg, (resp) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        if (isSupportedSite) showDisconnected();
        else showOffline();
        callOnce(null);
        return;
      }
      connected = true;
      hideInjectRow();
      callOnce(resp);
    });
  });
}

// Inject content script programmatically and retry connection
async function injectAndRetry() {
  const btn = $("injectBtn");
  if (btn.disabled) return;
  btn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { btn.disabled = false; return; }

  if (!_isSupportedSite(tab.url)) {
    statusEl.textContent = "NO SITE";
    statusEl.className = "status-badge no-video";
    // status shown via badge
    btn.disabled = false;
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["settings-sync.js", "content.js"],
    });
    // Wait for script to initialize
    setTimeout(refreshState, 500);
  } catch (e) {
    console.warn("[Ripple Wave] Injection failed:", e.message);
    statusEl.textContent = "FAILED";
    statusEl.className = "status-badge no-video";
  } finally {
    setTimeout(() => { btn.disabled = false; }, 2000);
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
  intensityLabel.textContent = info.label;

  // DeepFilter panel
  dfPanel.classList.toggle("show", modeVal === "deep");
  // Show presets for all modes — they map to the universal intensity slider
  eqPresets.style.display = "";

  if (modeVal === "deep") {
    dfIcon.textContent = "\u2713";
    dfText.textContent = "Bundled locally";
    if (dfNote) {
      dfNote.textContent = "Ships with Ripple Wave and caches in IndexedDB on first use.";
    }
  }
}

function updateUI(state) {
  if (!state) return;
  const effectiveActive = state.effectiveActive ?? state.active;

  // Power button
  if (state.active) {
    toggle.textContent = "ON";
    toggle.classList.add("on");
  } else {
    toggle.textContent = "OFF";
    toggle.classList.remove("on");
  }
  toggle.setAttribute("aria-pressed", String(!!state.active));

  // Status badge — only update when connected to content script,
  // otherwise the status was already set by showOffline/showDisconnected.
  if (connected) {
    if (!state.hooked) {
      statusEl.textContent = "NO VIDEO";
      statusEl.className = "status-badge no-video";
    } else if (effectiveActive) {
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
        effectiveActive: resp.effectiveActive,
        mode: resp.mode,
        intensity: resp.intensity,
        hooked: resp.hooked,
        dfDownloaded: true,
      };
      updateUI(liveState);
      refreshCurrentChannel(resp.hooked ? 4 : 8, resp.hooked ? 300 : 450);
    }
  });
}

// ─── Update Banner ───
function showUpdateBanner(version, url) {
  // Defense-in-depth: only accept GitHub URLs for the update link
  if (!url || !url.startsWith("https://github.com/")) return;
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
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.ytdc_update_version) {
    chrome.storage.local.set({ ytdc_update_dismissed: false });
  }
  if ((areaName === "sync" || areaName === "local") && changes.ytdc_channel_rules) {
    refreshCurrentChannel(1, 0);
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
      wrap.textContent = ([...name][0] || "?").toUpperCase();
      wrap.style.background = _chColor(name);
    });
    wrap.appendChild(img);
  } else {
    wrap.textContent = ([...name][0] || "?").toUpperCase();
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

function _getRuleMatch(rules, infoOrId) {
  if (!rules) return null;
  if (typeof infoOrId === "string") {
    return rules[infoOrId] ? { key: infoOrId, entry: rules[infoOrId] } : null;
  }
  const keys = Array.isArray(infoOrId?.ruleKeys) && infoOrId.ruleKeys.length > 0
    ? infoOrId.ruleKeys
    : [infoOrId?.id].filter(Boolean);
  for (const key of keys) {
    if (rules[key]) return { key, entry: rules[key] };
  }
  return null;
}

async function _saveChannelRule(id, name, iconUrl, rule, ruleKeys = []) {
  const res = await getSyncedSettings(["ytdc_channel_rules"]).catch(() => ({}));
  const rules = res.ytdc_channel_rules || {};
  const cleanupKeys = new Set(Array.isArray(ruleKeys) ? ruleKeys : []);
  cleanupKeys.delete(id);
  cleanupKeys.forEach((key) => { delete rules[key]; });
  rules[id] = { name, iconUrl, rule };
  await saveToStorage({ ytdc_channel_rules: rules }, { immediate: true });
  renderChannelList(rules);
}

async function _removeChannelRule(id) {
  const res = await getSyncedSettings(["ytdc_channel_rules"]).catch(() => ({}));
  const rules = res.ytdc_channel_rules || {};
  delete rules[id];
  await saveToStorage({ ytdc_channel_rules: rules }, { immediate: true });
  renderChannelList(rules);
  // Re-render current channel strip without the saved rule
  if (_currentChInfo && (_currentChInfo.id === id || (_currentChInfo.ruleKeys || []).includes(id))) {
    renderCurrentChannel(_currentChInfo, rules);
  }
}

let _currentChInfo = null;
let _channelRefreshTimer = null;
let _channelRefreshSeq = 0;

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

function _getSourceLabel(info) {
  switch (info?.sourceType) {
    case "account":
      return "Current account";
    case "page":
      return "Current page";
    case "profile":
      return "Current profile";
    case "creator":
      return "Current creator";
    case "subreddit":
      return "Current subreddit";
    case "channel":
    default:
      return "Current channel";
  }
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
  label.textContent = _getSourceLabel(info);
  chCurrentWrap.appendChild(label);

  const matchedRule = _getRuleMatch(rules || {}, info);
  const savedRule = matchedRule?.entry?.rule || null;
  chCurrentWrap.appendChild(
    _buildChRow(info.id, info.name, info.iconUrl, savedRule, savedRule
      ? (wrap, cId, cName, cIcon) => {
          const del = document.createElement("button");
          del.className = "ch-delete-btn";
          del.title = "Remove rule";
          del.textContent = "\u2715";
          del.addEventListener("click", () => _removeChannelRule(matchedRule?.key || cId));
          wrap.appendChild(del);
        }
      : null
    )
  );

  const row = chCurrentWrap.querySelector(".ch-row");
  const seg = row?.querySelector(".rule-seg");
  if (seg) {
    seg.replaceWith(_makeRuleSeg(savedRule, (r) => _saveChannelRule(info.id, info.name, info.iconUrl, r, info.ruleKeys || [])));
  }

  const divider = document.createElement("div");
  divider.style.cssText = "height:1px;background:var(--border);margin:4px 0";
  chCurrentWrap.appendChild(divider);
}

function refreshCurrentChannel(maxRetries = 6, delayMs = 400) {
  const seq = ++_channelRefreshSeq;
  if (_channelRefreshTimer) {
    clearTimeout(_channelRefreshTimer);
    _channelRefreshTimer = null;
  }

  const attempt = async (remaining) => {
    const res = await getSyncedSettings(["ytdc_channel_rules"]).catch(() => ({}));
    if (seq !== _channelRefreshSeq) return;
    const rules = res.ytdc_channel_rules || {};
    renderChannelList(rules);

    sendMsg({ action: "getChannelInfo" }, (resp) => {
      if (seq !== _channelRefreshSeq) return;
      _currentChInfo = resp || null;
      renderCurrentChannel(_currentChInfo, rules);

      if (resp && localStorage.getItem("ytdc_channels_open") === null) {
        channelsSection.classList.add("open");
        channelsHeaderBtn.setAttribute("aria-expanded", "true");
      }

      if (!_currentChInfo && remaining > 0 && connected) {
        _channelRefreshTimer = setTimeout(() => attempt(remaining - 1), delayMs);
      }
    });
  };

  attempt(maxRetries);
}

function initChannels() {
  const expanded = localStorage.getItem("ytdc_channels_open") !== "false";
  if (expanded) channelsSection.classList.add("open");
  channelsHeaderBtn.setAttribute("aria-expanded", String(expanded));

  getSyncedSettings(["ytdc_channel_rules"]).then((res) => {
    const rules = res?.ytdc_channel_rules || {};
    renderChannelList(rules);
    refreshCurrentChannel(8, 450);
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

// ─── Built-in topic categories ───
// These map to the keyword groups in content.js DETECT_KEYWORDS_HIGH/MED.
// Users can disable them (stored in ytdc_disabled_topics).
const BUILTIN_TOPICS = [
  "Mechanical keyboards",
  "Competitive programming",
  "Vim / Neovim / Emacs",
  "Terminal / CLI / Shell",
  "Live coding interviews",
  "DSA implementations",
  "Live coding sessions",
  "Framework tutorials",
  "DSA courses & lectures",
  "DevOps / infrastructure",
  "Study / work with me",
  "Coding challenges",
  "ASMR coding",
];

function _saveTopics(disabledTopics, customKws) {
  saveToStorage({
    ytdc_disabled_topics: disabledTopics,
    ytdc_custom_keywords: customKws.join(","),
  }, { immediate: true }).catch(() => {});
}

let _disabledTopics = [];
let _customKws = [];

function renderTopicTags() {
  _clearEl(detectTopicsEl);
  // Built-in topics
  BUILTIN_TOPICS.forEach(topic => {
    const isOff = _disabledTopics.includes(topic);
    const tag = document.createElement("span");
    tag.className = "topic-tag builtin" + (isOff ? " disabled" : "");
    tag.textContent = topic;
    const btn = document.createElement("button");
    btn.className = "tag-remove";
    btn.textContent = isOff ? "+" : "\u00d7";
    btn.title = isOff ? "Re-enable" : "Disable";
    btn.addEventListener("click", () => {
      if (isOff) {
        _disabledTopics = _disabledTopics.filter(t => t !== topic);
      } else {
        _disabledTopics.push(topic);
      }
      _saveTopics(_disabledTopics, _customKws);
      renderTopicTags();
    });
    tag.appendChild(btn);
    detectTopicsEl.appendChild(tag);
  });
  // Custom keywords
  _customKws.forEach((kw, i) => {
    const tag = document.createElement("span");
    tag.className = "topic-tag custom";
    tag.textContent = kw;
    const btn = document.createElement("button");
    btn.className = "tag-remove";
    btn.textContent = "\u00d7";
    btn.title = "Remove";
    btn.addEventListener("click", () => {
      _customKws.splice(i, 1);
      _saveTopics(_disabledTopics, _customKws);
      renderTopicTags();
    });
    tag.appendChild(btn);
    detectTopicsEl.appendChild(tag);
  });
}

function initDetect() {
  getSyncedSettings(["ytdc_autodetect", "ytdc_custom_keywords", "ytdc_disabled_topics"]).then((result) => {
    const on = result.ytdc_autodetect ?? true;
    setDetectToggleUI(on);
    _disabledTopics = result.ytdc_disabled_topics || [];
    // Lowercase keywords on load to match the content script's matching behavior
    _customKws = (result.ytdc_custom_keywords || "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    renderTopicTags();
  });
}

detectToggle.addEventListener("click", () => {
  const isOn = detectToggle.classList.contains("on");
  const next = !isOn;
  setDetectToggleUI(next);
  saveToStorage({ ytdc_autodetect: next }, { immediate: true });
  if (next) sendMsg({ action: "rerunDetection" });
});

// Add custom keyword on Enter
customKeywordInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const val = customKeywordInput.value.trim().toLowerCase();
  if (!val || _customKws.includes(val)) { customKeywordInput.value = ""; return; }
  _customKws.push(val);
  _saveTopics(_disabledTopics, _customKws);
  customKeywordInput.value = "";
  renderTopicTags();
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
let _toggleBusy = false;
toggle.addEventListener("click", () => {
  if (_toggleBusy) return; // guard against rapid clicking
  _toggleBusy = true;
  setTimeout(() => { _toggleBusy = false; }, 400);

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

    // Persist to storage and update UI immediately (no content script needed)
    saveToStorage({ ytdc_mode: newMode });
    updateModeUI(newMode, dfDownloaded);

    // Also apply to content script if available
    sendMsg({ action: "setMode", value: newMode }, (resp) => {
      if (resp) setTimeout(refreshState, 200);
    });
  });
});

// ─── Intensity Slider ───
let _sliderMsgTimer = null;
intensitySlider.addEventListener("input", () => {
  const val = parseInt(intensitySlider.value);
  intensityVal.textContent = val;
  presetBtns.forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.val) === val);
  });
  // Debounce storage write + content script message to avoid flooding during drag
  clearTimeout(_sliderMsgTimer);
  _sliderMsgTimer = setTimeout(() => {
    saveToStorage({ ytdc_intensity: val });
    sendMsg({ action: "setIntensity", value: val });
  }, 50);
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
  const subject = encodeURIComponent("Ripple Wave v3 — Bug Report");
  const body = encodeURIComponent(
    "Bug Report — Ripple Wave v3\n" +
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


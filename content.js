// YT DeClicker v3 — Content Script
// Three modes: EQ (lite), RNNoise (ML), DeepFilterNet3 (deep)

(function () {
  "use strict";

  // Guard against double-injection (manifest + programmatic)
  if (window._ytdeclicker_loaded) return;
  window._ytdeclicker_loaded = true;

  const STATE_KEY = "ytdeclicker_state_v3";
  const DB_NAME = "ytdeclicker_assets";
  const DB_VERSION = 2; // bumped for asset versioning
  const STORE_NAME = "models";
  const ASSET_VERSION_KEY = "asset_version";
  const CURRENT_ASSET_VERSION = "2026.1"; // bump when CDN models change

  // CDN URLs for DeepFilterNet3
  const DF3_CDN = "https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3";
  const DF3_WASM_URL = `${DF3_CDN}/v2/pkg/df_bg.wasm`;
  const DF3_MODEL_URL = `${DF3_CDN}/v2/models/DeepFilterNet3_onnx.tar.gz`;

  let audioCtx = null;
  let sourceNode = null;
  let currentVideo = null;

  // State
  let isActive = false;
  let mode = "eq"; // "eq" | "ml" | "deep"
  let intensity = 70;
  let connecting = false; // guard against concurrent connect calls

  // EQ nodes
  let eqFilters = [];
  let eqCompressor = null;
  let eqGainNode = null;

  // RNNoise nodes
  let rnnoiseNode = null;
  let mlGainNode = null;
  let rnnoiseWorkletReady = false;
  let rnnoiseWorkletLoading = false;

  // DeepFilter nodes
  let dfNode = null;
  let dfGainNode = null;
  let dfWorkletReady = false;
  let dfWorkletLoading = false;
  let dfAssetsDownloaded = false;
  let dfWasmModule = null;
  let dfModelBytes = null;

  // Navigation listener flag
  let navListenerAdded = false;

  // ─── EQ Filter Definitions ───
  // Keyboard clicks have sharp transient energy concentrated at 2–5 kHz
  // with harmonics extending to ~8 kHz. Narrow Q targets click resonances
  // while preserving speech formants (F1 300-1000Hz, F2 1000-2500Hz).
  const CLICK_BANDS = [
    { type: "peaking", freq: 1400, Q: 4.0, gain: -6 },   // low click body
    { type: "peaking", freq: 2200, Q: 3.5, gain: -10 },  // primary click resonance
    { type: "peaking", freq: 3500, Q: 3.5, gain: -12 },  // peak click energy
    { type: "peaking", freq: 5000, Q: 3.0, gain: -10 },  // click upper harmonics
    { type: "peaking", freq: 7000, Q: 2.5, gain: -7 },   // click air/brightness
    { type: "highshelf", freq: 8000, Q: 0.7, gain: -3 },  // tame everything above
  ];

  function scaleGain(base, pct) { return base * (pct / 100); }

  // ─── IndexedDB for model caching ───
  let _dbInstance = null;
  function openDB() {
    if (_dbInstance) return Promise.resolve(_dbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        _dbInstance = req.result;
        // Reset on unexpected close so next call reopens
        _dbInstance.onclose = () => { _dbInstance = null; };
        resolve(_dbInstance);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheHas(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.count(key);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ─── Asset Versioning ───
  async function checkAssetVersion() {
    try {
      const stored = await cacheGet(ASSET_VERSION_KEY);
      if (stored !== CURRENT_ASSET_VERSION) {
        await cacheDelete("df3_wasm");
        await cacheDelete("df3_model");
        await cacheSet(ASSET_VERSION_KEY, CURRENT_ASSET_VERSION);
        return false;
      }
      return true;
    } catch (e) {
      return true; // don't nuke cache on version check failure
    }
  }

  // ─── State Persistence ───
  function loadState() {
    try {
      const saved = localStorage.getItem(STATE_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        isActive = s.active ?? false;
        mode = s.mode ?? "eq";
        intensity = s.intensity ?? 70;
      }
    } catch (e) {
      console.warn("[YT DeClicker] Failed to load state:", e);
    }
  }

  let _saveTimer = null;
  function saveState() {
    // Debounce saves to avoid thrashing localStorage during slider drags
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify({ active: isActive, mode, intensity }));
      } catch (e) {
        console.warn("[YT DeClicker] Failed to save state:", e);
      }
    }, 300);
  }

  function saveStateImmediate() {
    if (_saveTimer) clearTimeout(_saveTimer);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ active: isActive, mode, intensity }));
    } catch (e) {}
  }

  // ─── Audio Context ───
  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new AudioContext({ sampleRate: 48000 });
    }
    // Resume suspended context (Chrome autoplay policy)
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // ─── Disconnect Everything ───
  function disconnectAll() {
    try { sourceNode?.disconnect(); } catch (e) {}
    for (const f of eqFilters) { try { f.disconnect(); } catch (e) {} }
    eqFilters = [];
    try { eqCompressor?.disconnect(); } catch (e) {}
    eqCompressor = null;
    try { eqGainNode?.disconnect(); } catch (e) {}
    eqGainNode = null;
    if (rnnoiseNode) {
      try { rnnoiseNode.port.postMessage("destroy"); } catch (e) {}
      try { rnnoiseNode.disconnect(); } catch (e) {}
      rnnoiseNode = null;
    }
    try { mlGainNode?.disconnect(); } catch (e) {}
    mlGainNode = null;
    if (dfNode) {
      try { dfNode.port.postMessage({ type: "DESTROY" }); } catch (e) {}
      try { dfNode.disconnect(); } catch (e) {}
      dfNode = null;
    }
    try { dfGainNode?.disconnect(); } catch (e) {}
    dfGainNode = null;
  }

  // ─── EQ Mode ───
  function buildEqChain(ctx) {
    eqFilters = CLICK_BANDS.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      f.Q.value = band.Q;
      f.gain.value = scaleGain(band.gain, intensity);
      return f;
    });
    eqCompressor = ctx.createDynamicsCompressor();
    eqCompressor.threshold.value = -24;       // catch louder clicks
    eqCompressor.knee.value = 6;              // sharper knee for transients
    eqCompressor.ratio.value = 8;             // aggressive ratio for clicks
    eqCompressor.attack.value = 0.0005;       // 0.5ms — catch the click onset
    eqCompressor.release.value = 0.04;        // 40ms — recover before next syllable
    eqGainNode = ctx.createGain();
    eqGainNode.gain.value = 1.12;             // slight makeup gain
  }

  function connectEqChain() {
    const ctx = ensureAudioCtx();
    buildEqChain(ctx);
    let prev = sourceNode;
    for (const filter of eqFilters) { prev.connect(filter); prev = filter; }
    prev.connect(eqCompressor);
    eqCompressor.connect(eqGainNode);
    eqGainNode.connect(ctx.destination);
  }

  // ─── RNNoise Mode ───
  async function ensureRnnoiseWorklet() {
    if (rnnoiseWorkletReady) return true;
    if (rnnoiseWorkletLoading) {
      return new Promise((res) => {
        const c = setInterval(() => { if (rnnoiseWorkletReady) { clearInterval(c); res(true); } }, 50);
        setTimeout(() => { clearInterval(c); res(false); }, 10000);
      });
    }
    rnnoiseWorkletLoading = true;
    try {
      const ctx = ensureAudioCtx();
      // Use the extension URL directly — files are web-accessible to youtube.com
      // Blob URLs are blocked by YouTube's CSP for worklet/worker scripts
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("rnnoise-worklet.js"));
      rnnoiseWorkletReady = true;
      return true;
    } catch (e) {
      console.error("[YT DeClicker] RNNoise worklet failed:", e);
      return false;
    } finally { rnnoiseWorkletLoading = false; }
  }

  async function loadRnnoiseWasm() {
    let wasmFile = "rnnoise.wasm";
    try {
      const simd = await WebAssembly.validate(new Uint8Array([
        0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
      ]));
      if (simd) wasmFile = "rnnoise_simd.wasm";
    } catch (e) {}
    const resp = await fetch(chrome.runtime.getURL(wasmFile));
    return await resp.arrayBuffer();
  }

  async function connectRnnoiseChain() {
    const ctx = ensureAudioCtx();
    try {
      const [binary, ready] = await Promise.all([loadRnnoiseWasm(), ensureRnnoiseWorklet()]);
      if (!ready) { mode = "eq"; connectEqChain(); return; }
      rnnoiseNode = new AudioWorkletNode(ctx, "@sapphi-red/web-noise-suppressor/rnnoise", {
        processorOptions: { wasmBinary: binary, maxChannels: 2 },
      });
      mlGainNode = ctx.createGain();
      mlGainNode.gain.value = 1.0 + (intensity / 100) * 0.3;
      sourceNode.connect(rnnoiseNode);
      rnnoiseNode.connect(mlGainNode);
      mlGainNode.connect(ctx.destination);
    } catch (e) {
      console.error("[YT DeClicker] RNNoise chain error:", e);
      mode = "eq"; connectEqChain();
    }
  }

  // ─── DeepFilterNet3 Mode ───
  async function checkDfAssetsDownloaded() {
    try {
      return (await cacheHas("df3_wasm")) && (await cacheHas("df3_model"));
    } catch (e) { return false; }
  }

  // Download a file via the background service worker (bypasses page CSP).
  // Binary data is transferred via chrome.storage.session (base64) to avoid
  // the message-size limit on sendMessage which would choke on multi-MB files.
  function proxyDownload(url, storageKey, requestId) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "proxyDownload", url, storageKey, requestId },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (resp && resp.ok) {
            // Read binary from chrome.storage.local (matches background.js)
            chrome.storage.local.get(storageKey, (result) => {
              if (chrome.runtime.lastError || !result[storageKey]) {
                reject(new Error("Failed to read downloaded data from storage"));
                return;
              }
              const b64 = result[storageKey];
              // Clean up storage immediately
              chrome.storage.local.remove(storageKey);
              // Decode base64 to ArrayBuffer
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              resolve(bytes.buffer);
            });
          } else {
            reject(new Error(resp?.error || "Download failed"));
          }
        }
      );
    });
  }

  async function downloadDfAssets(progressCb) {
    // Listen for progress from background service worker
    const progressHandler = (msg) => {
      if (msg.type === "downloadProgress") {
        if (msg.requestId === "df3_wasm") {
          progressCb?.({ stage: "wasm", progress: msg.progress });
        } else if (msg.requestId === "df3_model") {
          progressCb?.({ stage: "model", progress: msg.progress });
        }
      }
    };
    chrome.runtime.onMessage.addListener(progressHandler);

    try {
      // Download WASM via background service worker → session storage → IndexedDB
      progressCb?.({ stage: "wasm", progress: 0 });
      const wasmBytes = await proxyDownload(DF3_WASM_URL, "_df3_wasm_transfer", "df3_wasm");
      await cacheSet("df3_wasm", wasmBytes);
      progressCb?.({ stage: "wasm", progress: 100 });

      // Download Model via background service worker → session storage → IndexedDB
      progressCb?.({ stage: "model", progress: 0 });
      const modelBytes = await proxyDownload(DF3_MODEL_URL, "_df3_model_transfer", "df3_model");
      await cacheSet("df3_model", modelBytes);
      progressCb?.({ stage: "model", progress: 100 });

      // Store asset version
      await cacheSet(ASSET_VERSION_KEY, CURRENT_ASSET_VERSION);
      dfAssetsDownloaded = true;
      return true;
    } finally {
      chrome.runtime.onMessage.removeListener(progressHandler);
    }
  }

  async function deleteDfAssets() {
    try {
      await cacheDelete("df3_wasm");
      await cacheDelete("df3_model");
      await cacheDelete(ASSET_VERSION_KEY);
    } catch (e) {}
    dfAssetsDownloaded = false;
    dfWasmModule = null;
    dfModelBytes = null;
  }

  async function loadDfAssets() {
    if (dfWasmModule && dfModelBytes) return true;
    try {
      const wasmBytes = await cacheGet("df3_wasm");
      const modelBuf = await cacheGet("df3_model");
      if (!wasmBytes || !modelBuf) return false;
      dfWasmModule = await WebAssembly.compile(wasmBytes);
      dfModelBytes = modelBuf;
      return true;
    } catch (e) {
      console.error("[YT DeClicker] Failed to load DF3 assets from cache:", e);
      return false;
    }
  }

  async function ensureDfWorklet() {
    if (dfWorkletReady) return true;
    if (dfWorkletLoading) {
      return new Promise((res) => {
        const c = setInterval(() => { if (dfWorkletReady) { clearInterval(c); res(true); } }, 50);
        setTimeout(() => { clearInterval(c); res(false); }, 15000);
      });
    }
    dfWorkletLoading = true;
    try {
      const ctx = ensureAudioCtx();
      // Use extension URL directly — blob URLs blocked by YouTube's CSP
      await ctx.audioWorklet.addModule(chrome.runtime.getURL("deepfilter-worklet.js"));
      dfWorkletReady = true;
      return true;
    } catch (e) {
      console.error("[YT DeClicker] DeepFilter worklet failed:", e);
      return false;
    } finally { dfWorkletLoading = false; }
  }

  async function connectDfChain() {
    const ctx = ensureAudioCtx();
    try {
      const [assetsOk, workletOk] = await Promise.all([loadDfAssets(), ensureDfWorklet()]);
      if (!assetsOk || !workletOk) {
        console.warn("[YT DeClicker] DeepFilter unavailable, falling back to RNNoise");
        mode = "ml";
        await connectRnnoiseChain();
        return;
      }

      dfNode = new AudioWorkletNode(ctx, "deepfilter-audio-processor", {
        processorOptions: {
          wasmModule: dfWasmModule,
          modelBytes: dfModelBytes,
          suppressionLevel: intensity,
        },
      });

      dfGainNode = ctx.createGain();
      dfGainNode.gain.value = 1.0 + (intensity / 100) * 0.2;

      sourceNode.connect(dfNode);
      dfNode.connect(dfGainNode);
      dfGainNode.connect(ctx.destination);
    } catch (e) {
      console.error("[YT DeClicker] DeepFilter chain error:", e);
      mode = "ml";
      await connectRnnoiseChain();
    }
  }

  // ─── Main Routing ───
  async function connectActive() {
    if (connecting) return; // guard against concurrent calls
    connecting = true;
    try {
      disconnectAll();
      if (!sourceNode || !audioCtx) return;
      if (mode === "deep") await connectDfChain();
      else if (mode === "ml") await connectRnnoiseChain();
      else connectEqChain();
    } finally {
      connecting = false;
    }
  }

  function connectBypass() {
    disconnectAll();
    if (sourceNode && audioCtx) sourceNode.connect(audioCtx.destination);
  }

  // ─── Video Hooking ───
  function hookVideo(video) {
    if (!video || video === currentVideo) return;
    currentVideo = video;
    const ctx = ensureAudioCtx();
    disconnectAll();
    if (!video._ytdeclicker_source) {
      video._ytdeclicker_source = ctx.createMediaElementSource(video);
    }
    sourceNode = video._ytdeclicker_source;
    if (isActive) connectActive();
    else connectBypass();
  }

  function findAndHook() {
    const video = document.querySelector("video.html5-main-video, video");
    if (video) {
      if (video.readyState >= 1) {
        hookVideo(video);
        return true;
      }
      // Wait for metadata to load if video exists but isn't ready
      video.addEventListener("loadedmetadata", () => hookVideo(video), { once: true });
      return true; // found video, will hook when ready
    }
    return false;
  }

  function observe() {
    if (findAndHook()) return;
    const obs = new MutationObserver(() => {
      if (findAndHook()) obs.disconnect();
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });

    // Only add navigation listener once
    if (!navListenerAdded) {
      navListenerAdded = true;
      window.addEventListener("yt-navigate-finish", () => setTimeout(findAndHook, 500));
    }
  }

  // ─── Actions ───
  function activate() {
    isActive = true;
    connectActive();
    saveStateImmediate();
  }

  function deactivate() {
    isActive = false;
    connectBypass(); // disconnectAll() inside handles destroy + null
    saveStateImmediate();
  }

  function setMode(newMode) {
    if (!["eq", "ml", "deep"].includes(newMode)) return;
    mode = newMode;
    if (isActive) {
      connectActive(); // disconnectAll() inside handles destroy + null
    }
    saveStateImmediate();
  }

  function setIntensity(pct) {
    intensity = Math.max(0, Math.min(100, pct));

    // EQ mode: scale filter gains proportionally
    CLICK_BANDS.forEach((band, i) => {
      if (eqFilters[i]?.gain) eqFilters[i].gain.value = scaleGain(band.gain, intensity);
    });
    // Also scale compressor threshold with intensity (more aggressive at higher values)
    if (eqCompressor) {
      eqCompressor.threshold.value = -24 - (intensity / 100) * 12; // -24 to -36 dB
    }

    // ML mode: RNNoise doesn't have a suppression parameter, so we use
    // a wet/dry mix via gain. Higher intensity = more of the suppressed signal.
    if (mlGainNode) mlGainNode.gain.value = 1.0 + (intensity / 100) * 0.3;

    // Deep mode: send actual suppression level to the worklet processor AND adjust gain
    if (dfNode) {
      try {
        dfNode.port.postMessage({ type: "SET_SUPPRESSION_LEVEL", value: intensity });
      } catch (e) {}
    }
    if (dfGainNode) dfGainNode.gain.value = 1.0 + (intensity / 100) * 0.2;

    saveState();
  }

  // Safe message sender (popup may be closed)
  function safeSendMessage(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (e) {
      // Extension context invalidated or popup closed — ignore
    }
  }

  // ─── Message Handling ───
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // Ignore messages without an action (e.g. progress updates from background)
      if (!msg.action) return false;
      const handleAsync = async () => {
        switch (msg.action) {
          case "activate": activate(); return { ok: true };
          case "deactivate": deactivate(); return { ok: true };
          case "setMode": setMode(msg.value); return { ok: true };
          case "setIntensity": setIntensity(msg.value); return { ok: true };
          case "getState":
            const downloaded = await checkDfAssetsDownloaded();
            dfAssetsDownloaded = downloaded;
            return { active: isActive, mode, intensity, hooked: !!currentVideo, dfDownloaded: downloaded };
          case "downloadDf":
            try {
              await downloadDfAssets((p) => {
                safeSendMessage({ type: "dfProgress", ...p });
              });
              return { ok: true };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          case "deleteDf":
            await deleteDfAssets();
            return { ok: true };
        }
      };
      handleAsync().then(sendResponse);
      return true; // keep message channel open for async response
    });
  }

  // ─── Init ───
  loadState();
  checkAssetVersion();
  checkDfAssetsDownloaded().then(d => { dfAssetsDownloaded = d; });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe);
  } else { observe(); }
})();

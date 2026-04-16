// Ripple Wave v3 — Content Script (YouTube + Reddit + X/Twitter + Twitch + Facebook + LinkedIn + Kick)
// Three modes: EQ (lite), RNNoise (ML), DeepFilterNet3 (deep)

(function () {
  "use strict";

  // Guard against double-injection (manifest + programmatic)
  if (window._declicker_loaded) return;
  window._declicker_loaded = true;

  // ─── Site Detection ───
  const SITE_YOUTUBE = "youtube";
  const SITE_REDDIT  = "reddit";
  const SITE_X       = "x";
  const SITE_TWITCH  = "twitch";
  const SITE_FACEBOOK = "facebook";
  const SITE_LINKEDIN = "linkedin";
  const SITE_KICK = "kick";
  const SITE_UNKNOWN = "unknown";
  const X_RESERVED_HANDLES = new Set([
    "about", "account", "admin", "api", "blog", "compose", "developer",
    "download", "explore", "hashtag", "help", "home", "i", "intent",
    "login", "messages", "notifications", "privacy", "search", "settings",
    "share", "signup", "tos", "verified", "widgets", "x",
  ]);
  const TWITCH_RESERVED_PATHS = new Set([
    "activate", "bits", "directory", "downloads", "friends", "inventory",
    "jobs", "login", "messages", "moderator", "payments", "prime",
    "products", "search", "settings", "signup", "store", "subscriptions",
    "turbo", "videos", "wallet",
  ]);
  const FACEBOOK_RESERVED_PATHS = new Set([
    "ads", "events", "gaming", "groups", "help", "home", "login",
    "marketplace", "messages", "notifications", "pages", "photo", "photos",
    "profile.php", "reel", "reels", "saved", "search", "share", "stories",
    "video.php", "videos", "watch", "watchlive",
  ]);
  // LinkedIn uses an allow-list in _extractLinkedInProfileId (/in, /company,
  // /school) rather than a reserved-path blocklist, so no LINKEDIN_RESERVED_PATHS.
  const KICK_RESERVED_PATHS = new Set([
    "browse", "categories", "clips", "dashboard", "downloads", "following",
    "kickclips", "messages", "privacy-policy", "search", "settings",
    "safety", "subscriptions", "terms-of-service", "video", "videos",
  ]);
  function _detectSite() {
    const h = location.hostname;
    if (h.includes("youtube.com")) return SITE_YOUTUBE;
    if (h.includes("reddit.com")) return SITE_REDDIT;
    if (h === "x.com" || h.endsWith(".x.com") || h === "twitter.com" || h.endsWith(".twitter.com")) return SITE_X;
    if (h === "twitch.tv" || h.endsWith(".twitch.tv")) return SITE_TWITCH;
    if (h === "facebook.com" || h.endsWith(".facebook.com") || h === "fb.watch") return SITE_FACEBOOK;
    if (h === "linkedin.com" || h.endsWith(".linkedin.com")) return SITE_LINKEDIN;
    if (h === "kick.com" || h.endsWith(".kick.com")) return SITE_KICK;
    return SITE_UNKNOWN;
  }
  const SITE = _detectSite();

  function _isVideoPage() {
    const p = location.pathname;
    if (SITE === SITE_YOUTUBE) return p.startsWith("/watch") || p.startsWith("/shorts/") || p.startsWith("/live/");
    if (SITE === SITE_REDDIT) return p.includes("/comments/");
    if (SITE === SITE_X) return p.includes("/status/") || !!document.querySelector("article video, [data-testid='videoPlayer'] video, video");
    if (SITE === SITE_TWITCH) {
      const parts = p.split("/").filter(Boolean);
      return /^\/videos\/\d+/.test(p) ||
        p.includes("/clip/") || p.includes("/clip?") ||
        (parts.length === 1 && !TWITCH_RESERVED_PATHS.has(parts[0].toLowerCase())) ||
        (parts[0] === "popout" && !!parts[1]);
    }
    if (SITE === SITE_FACEBOOK) return p.startsWith("/watch") || p.startsWith("/reel/") || p.startsWith("/share/v/") || p === "/video.php" || p.includes("/videos/");
    if (SITE === SITE_LINKEDIN) return p.includes("/feed/") || p.includes("/posts/") || p.includes("/video/");
    if (SITE === SITE_KICK) {
      const parts = p.split("/").filter(Boolean);
      return (parts.length === 1 && !KICK_RESERVED_PATHS.has(parts[0].toLowerCase())) || (parts[0] === "video" && !!parts[1]);
    }
    return false;
  }

  const LEGACY_DB_NAME = "ytdeclicker_assets"; // deleted on startup — see _deleteLegacyAssetDB
  const LEGACY_LOCALSTORAGE_KEY = "ytdeclicker_state_v3"; // removed on startup — earlier builds wrote here

  // Bundled DeepFilterNet3 assets. These ship with the extension, so we fetch
  // them directly from chrome.runtime.getURL — a local disk read. An earlier
  // build cached them in IndexedDB back when they were downloaded from a CDN;
  // that cache is now pure overhead and has been removed.
  const DF3_WASM_URL = chrome.runtime.getURL("assets/deepfilter/df_bg.wasm");
  const DF3_MODEL_URL = chrome.runtime.getURL("assets/deepfilter/DeepFilterNet3_onnx.tar.gz");

  let audioCtx = null;
  let sourceNode = null;
  let currentVideo = null;
  const _videoSourceNodes = new WeakMap();
  const _captureBlockedVideos = new WeakSet();
  let _pendingGestureVideo = null;
  let _pendingGesturePlayVideo = null;
  let _audioUnlockArmed = false;

  // State
  let isActive = false;
  let mode = "eq"; // "eq" | "ml" | "deep"
  let intensity = 70;
  let _sourceRuleOverride = null; // null | "always" | "never"
  let connecting = false; // guard against concurrent connect calls
  let _pendingReconnect = false; // set when a mode/intensity change arrives while connecting

  // EQ nodes
  let eqFilters = [];
  let eqCompressor = null;
  let eqGainNode = null;

  // RNNoise nodes
  let rnnoiseNode = null;
  let mlGainNode = null;
  let rnnoiseWorkletReady = false;
  let _rnnoiseWorkletPromise = null; // dedup: shared in-flight addModule call

  // DeepFilter nodes
  let dfNode = null;
  let dfGainNode = null;
  let dfWorkletReady = false;
  let _dfWorkletPromise = null; // dedup: shared in-flight addModule call
  let _dfFailCount = 0;
  let dfAssetsDownloaded = false;
  let dfWasmModule = null;
  let dfModelBytes = null;

  // Navigation listener flag
  let navListenerAdded = false;
  let _hookWatchObserver = null;
  let _hookWatchInterval = null;
  let _hookWatchTimeout = null;
  let _hookWatchGen = 0;
  let _hookPassRafPending = false;
  const HOOK_WATCH_TIMEOUT_MS = 15000;
  // Fallback poll interval: only used as a safety net for DOM regions the
  // MutationObserver can't see (e.g. Reddit's shreddit-player shadow roots).
  // The observer handles the 99% case — this just backstops it.
  const HOOK_WATCH_POLL_MS = 1500;

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

  // One-time cleanup: remove the legacy IndexedDB that earlier builds used to
  // cache DeepFilter assets. The assets are now bundled with the extension and
  // served from chrome.runtime.getURL, so the IDB cache is pure overhead.
  // This runs once per tab and silently no-ops if the DB doesn't exist.
  let _legacyDbDeleted = false;
  function _deleteLegacyAssetDB() {
    if (_legacyDbDeleted) return;
    _legacyDbDeleted = true;
    try {
      const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
      req.onerror = () => {};
      req.onblocked = () => {};
    } catch (_) {}
  }

  // ─── State Persistence ───
  // Single source of truth: chrome.storage (via settings-sync.js, which
  // internally debounces + mirrors sync↔local). An earlier build mirrored
  // to localStorage as a "synchronous bootstrap" fallback, but it was
  // per-origin (youtube.com vs reddit.com) and never actually read back —
  // so it was pure dead weight. See _clearLegacyLocalState below.

  function _clearLegacyLocalState() {
    try { localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY); } catch (_) {}
  }

  async function _getExtensionSettings(keys) {
    if (globalThis.RippleWaveSettings?.getSettings) {
      return await globalThis.RippleWaveSettings.getSettings(keys);
    }
    return await new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function _saveExtensionSettings(patch, options = {}) {
    if (globalThis.RippleWaveSettings?.setSettings) {
      return globalThis.RippleWaveSettings.setSettings(patch, options).catch(() => {});
    }
    try {
      return chrome.storage.local.set(patch);
    } catch (e) {
      return Promise.resolve();
    }
  }

  // settings-sync.js already debounces writes internally (600ms), so this
  // is a thin pass-through. Kept for call-site readability.
  function saveState() {
    _saveExtensionSettings({ ytdc_active: isActive, ytdc_mode: mode, ytdc_intensity: intensity });
  }

  function saveStateImmediate() {
    _saveExtensionSettings({ ytdc_active: isActive, ytdc_mode: mode, ytdc_intensity: intensity }, { immediate: true });
  }

  function _getEffectiveActive() {
    if (_sourceRuleOverride === "always") return true;
    if (_sourceRuleOverride === "never") return false;
    return isActive;
  }

  function _hasSourceRuleDecision() {
    return _sourceRuleOverride === "always" || _sourceRuleOverride === "never";
  }

  function _setSourceRuleOverride(nextOverride) {
    const normalized = nextOverride === "always" || nextOverride === "never" ? nextOverride : null;
    const changed = _sourceRuleOverride !== normalized;
    _sourceRuleOverride = normalized;
    return changed;
  }

  function _applyEffectiveRouting(force = false) {
    const ctx = _getAudioCtx();
    if (!currentVideo) return;

    if (!sourceNode || !ctx || ctx.state !== "running") {
      if (_getEffectiveActive()) {
        _armDeferredAudioUnlock(currentVideo);
      }
      return;
    }

    if (_getEffectiveActive()) {
      if (force) {
        connectActive();
      }
    } else if (force) {
      connectBypass();
    }
  }

  // ─── Audio Context ───
  // When the tab becomes visible again, resume a suspended context — or force
  // a re-hook if Chrome closed it after a long idle (Chrome's autoplay policy
  // can close an idle AudioContext, at which point .resume() no longer works
  // and we have to recreate + re-hook).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
      return;
    }
    if (audioCtx.state === "closed") {
      // The existing sourceNode + chain are all tied to the dead context.
      // Stop any in-flight audio detection (its analyser is on the dead
      // context), drop everything, and let the next hook pass rebuild.
      _stopAudioClickDetection();
      audioCtx = null;
      sourceNode = null;
      currentVideo = null;
      if (_isContextValid()) _startHookWatch();
    }
  });

  function _getAudioCtx() {
    if (!audioCtx || audioCtx.state === "closed") return null;
    return audioCtx;
  }

  function _createAudioCtx() {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext({ sampleRate: 48000 });
    }
    return audioCtx;
  }

  function _removeAudioUnlockListeners() {
    if (_pendingGesturePlayVideo) {
      try { _pendingGesturePlayVideo.removeEventListener("play", _handleDeferredAudioUnlock, true); } catch (_) {}
      _pendingGesturePlayVideo = null;
    }
    if (!_audioUnlockArmed) return;
    _audioUnlockArmed = false;
    document.removeEventListener("pointerdown", _handleDeferredAudioUnlock, true);
    document.removeEventListener("keydown", _handleDeferredAudioUnlock, true);
    document.removeEventListener("touchstart", _handleDeferredAudioUnlock, true);
  }

  async function _handleDeferredAudioUnlock() {
    if (!_isContextValid()) {
      _removeAudioUnlockListeners();
      return;
    }
    const video = _pendingGestureVideo;
    if (!video || !video.isConnected) {
      _pendingGestureVideo = null;
      _removeAudioUnlockListeners();
      return;
    }
    const ctx = _createAudioCtx();
    if (ctx.state === "suspended") {
      try { await ctx.resume(); } catch (_) {}
    }
    if (ctx.state !== "running") return;
    _removeAudioUnlockListeners();
    hookVideo(video);
  }

  function _armDeferredAudioUnlock(video) {
    if (!video) return;
    _pendingGestureVideo = video;

    if (_pendingGesturePlayVideo !== video) {
      if (_pendingGesturePlayVideo) {
        try { _pendingGesturePlayVideo.removeEventListener("play", _handleDeferredAudioUnlock, true); } catch (_) {}
      }
      _pendingGesturePlayVideo = video;
      video.addEventListener("play", _handleDeferredAudioUnlock, true);
    }

    if (_audioUnlockArmed) return;
    _audioUnlockArmed = true;
    document.addEventListener("pointerdown", _handleDeferredAudioUnlock, true);
    document.addEventListener("keydown", _handleDeferredAudioUnlock, true);
    document.addEventListener("touchstart", _handleDeferredAudioUnlock, true);
  }

  // ─── Disconnect Everything ───
  function disconnectAll() {
    // Stop any in-flight audio-click detection. Its analyser is tapped from
    // sourceNode, so disconnecting sourceNode without also stopping detection
    // leaves the analyser holding a dead connection and the interval polling
    // a disconnected node.
    _stopAudioClickDetection();
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
    const ctx = _getAudioCtx();
    if (!ctx || !sourceNode) return;
    buildEqChain(ctx);
    let prev = sourceNode;
    for (const filter of eqFilters) { prev.connect(filter); prev = filter; }
    prev.connect(eqCompressor);
    eqCompressor.connect(eqGainNode);
    eqGainNode.connect(ctx.destination);
  }

  // ─── RNNoise Mode ───
  let _rnnoiseFailCount = 0;
  const MAX_WORKLET_RETRIES = 3;
  const RNNOISE_ADDMODULE_TIMEOUT_MS = 10000;

  function ensureRnnoiseWorklet() {
    if (rnnoiseWorkletReady) return Promise.resolve(true);
    if (_rnnoiseFailCount >= MAX_WORKLET_RETRIES) return Promise.resolve(false);
    if (_rnnoiseWorkletPromise) return _rnnoiseWorkletPromise;

    _rnnoiseWorkletPromise = (async () => {
      try {
        const ctx = _getAudioCtx();
        if (!ctx) return false;
        // Use the extension URL directly — files are web-accessible to youtube.com.
        // Blob URLs are blocked by YouTube's CSP for worklet/worker scripts.
        // Promise.race handles hangs (addModule can stall on network issues).
        let raceTimer;
        await Promise.race([
          ctx.audioWorklet.addModule(chrome.runtime.getURL("rnnoise-worklet.js")),
          new Promise((_, rej) => { raceTimer = setTimeout(() => rej(new Error("addModule timeout")), RNNOISE_ADDMODULE_TIMEOUT_MS); }),
        ]).finally(() => clearTimeout(raceTimer));
        rnnoiseWorkletReady = true;
        _rnnoiseFailCount = 0;
        return true;
      } catch (e) {
        _rnnoiseFailCount++;
        console.error("[Ripple Wave] RNNoise worklet failed (" + _rnnoiseFailCount + "/" + MAX_WORKLET_RETRIES + "):", e);
        return false;
      } finally {
        _rnnoiseWorkletPromise = null;
      }
    })();
    return _rnnoiseWorkletPromise;
  }

  // Cached across reconnects within the tab — every intensity change or mode
  // flip used to re-fetch 152 KB of wasm + re-run SIMD validation.
  let _rnnoiseWasmBinary = null;
  let _rnnoiseWasmLoading = null;
  const _SIMD_PROBE_BYTES = new Uint8Array([
    0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
  ]);

  function loadRnnoiseWasm() {
    if (_rnnoiseWasmBinary) return Promise.resolve(_rnnoiseWasmBinary);
    if (_rnnoiseWasmLoading) return _rnnoiseWasmLoading;

    _rnnoiseWasmLoading = (async () => {
      let wasmFile = "rnnoise.wasm";
      try {
        const simd = WebAssembly.validate(_SIMD_PROBE_BYTES);
        if (simd) wasmFile = "rnnoise_simd.wasm";
      } catch (e) {}
      const resp = await fetch(chrome.runtime.getURL(wasmFile));
      const buf = await resp.arrayBuffer();
      _rnnoiseWasmBinary = buf;
      return buf;
    })().finally(() => { _rnnoiseWasmLoading = null; });
    return _rnnoiseWasmLoading;
  }

  async function connectRnnoiseChain() {
    const ctx = _getAudioCtx();
    if (!ctx || !sourceNode) return;
    try {
      const [binary, ready] = await Promise.all([loadRnnoiseWasm(), ensureRnnoiseWorklet()]);
      if (!ready) {
        // Fall back to EQ. Only persist the fallback after the EQ chain is
        // actually connected — otherwise if EQ also throws we'd leave "eq"
        // persisted with no active chain.
        connectEqChain();
        mode = "eq";
        saveState();
        return;
      }
      rnnoiseNode = new AudioWorkletNode(ctx, "@sapphi-red/web-noise-suppressor/rnnoise", {
        processorOptions: { wasmBinary: binary, maxChannels: 2 },
      });
      mlGainNode = ctx.createGain();
      mlGainNode.gain.value = 1.0 + (intensity / 100) * 0.3;
      sourceNode.connect(rnnoiseNode);
      rnnoiseNode.connect(mlGainNode);
      mlGainNode.connect(ctx.destination);
    } catch (e) {
      console.error("[Ripple Wave] RNNoise chain error:", e);
      // Same reasoning as above — connect EQ first, then persist.
      try { connectEqChain(); mode = "eq"; saveState(); }
      catch (_) { /* last-ditch: bypass is handled by connectActive's outer catch */ }
    }
  }

  // ─── DeepFilterNet3 Mode ───
  async function _fetchDfAsset(url, label) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`${label} fetch failed: HTTP ${resp.status}`);
    }
    return await resp.arrayBuffer();
  }

  // Concurrency guard: if connectDfChain is called twice in quick succession
  // (e.g. intensity-change reconnect), share the in-flight load instead of
  // firing two parallel fetch+compile pairs.
  let _dfAssetsLoading = null;

  function loadDfAssets() {
    if (dfWasmModule && dfModelBytes) return Promise.resolve(true);
    if (_dfAssetsLoading) return _dfAssetsLoading;

    _dfAssetsLoading = (async () => {
      try {
        const [wasmBytes, modelBuf] = await Promise.all([
          _fetchDfAsset(DF3_WASM_URL, "DeepFilter Wasm"),
          _fetchDfAsset(DF3_MODEL_URL, "DeepFilter model"),
        ]);
        dfWasmModule = await WebAssembly.compile(wasmBytes);
        dfModelBytes = modelBuf;
        dfAssetsDownloaded = true;
        return true;
      } catch (e) {
        console.error("[Ripple Wave] Failed to load DF3 assets:", e);
        dfWasmModule = null;
        dfModelBytes = null;
        return false;
      } finally {
        _dfAssetsLoading = null;
      }
    })();
    return _dfAssetsLoading;
  }

  const DF_ADDMODULE_TIMEOUT_MS = 15000;

  function ensureDfWorklet() {
    if (dfWorkletReady) return Promise.resolve(true);
    if (_dfFailCount >= MAX_WORKLET_RETRIES) return Promise.resolve(false);
    if (_dfWorkletPromise) return _dfWorkletPromise;

    _dfWorkletPromise = (async () => {
      try {
        const ctx = _getAudioCtx();
        if (!ctx) return false;
        // Extension URL directly — blob URLs blocked by YouTube's CSP.
        let raceTimer;
        await Promise.race([
          ctx.audioWorklet.addModule(chrome.runtime.getURL("deepfilter-worklet.js")),
          new Promise((_, rej) => { raceTimer = setTimeout(() => rej(new Error("addModule timeout")), DF_ADDMODULE_TIMEOUT_MS); }),
        ]).finally(() => clearTimeout(raceTimer));
        dfWorkletReady = true;
        _dfFailCount = 0;
        return true;
      } catch (e) {
        _dfFailCount++;
        console.error("[Ripple Wave] DeepFilter worklet failed (" + _dfFailCount + "/" + MAX_WORKLET_RETRIES + "):", e);
        return false;
      } finally {
        _dfWorkletPromise = null;
      }
    })();
    return _dfWorkletPromise;
  }

  async function connectDfChain() {
    const ctx = _getAudioCtx();
    if (!ctx || !sourceNode) return;
    try {
      const [assetsOk, workletOk] = await Promise.all([loadDfAssets(), ensureDfWorklet()]);
      if (!assetsOk || !workletOk) {
        console.warn("[Ripple Wave] DeepFilter unavailable, falling back to RNNoise");
        // Fall back FIRST, persist AFTER — if RNNoise also fails, it will
        // persist its own fallback (to "eq"). This prevents leaving "ml"
        // persisted when neither ml nor deep actually worked.
        await connectRnnoiseChain();
        if (mode !== "eq") { mode = "ml"; saveState(); }
        return;
      }

      dfNode = new AudioWorkletNode(ctx, "deepfilter-audio-processor", {
        processorOptions: {
          wasmModule: dfWasmModule,
          modelBytes: dfModelBytes,
          suppressionLevel: intensity,
          maxChannels: 2,
        },
      });

      dfGainNode = ctx.createGain();
      dfGainNode.gain.value = 1.0 + (intensity / 100) * 0.2;

      sourceNode.connect(dfNode);
      dfNode.connect(dfGainNode);
      dfGainNode.connect(ctx.destination);
    } catch (e) {
      console.error("[Ripple Wave] DeepFilter chain error:", e);
      // Worklet was registered but node construction threw — the worklet
      // ready flag is stale. Reset so a future attempt re-registers, and
      // count this as a failure so exhaustion kicks in eventually.
      dfWorkletReady = false;
      _dfFailCount++;
      // Fall back FIRST, persist AFTER. See above.
      await connectRnnoiseChain();
      if (mode !== "eq") { mode = "ml"; saveState(); }
    }
  }

  // ─── Main Routing ───
  async function connectActive() {
    if (connecting) { _pendingReconnect = true; return; } // mode/intensity will retry
    connecting = true;
    _pendingReconnect = false;
    try {
      disconnectAll();
      const ctx = _getAudioCtx();
      if (!currentVideo) return;
      if (!sourceNode || !ctx || ctx.state !== "running") {
        _armDeferredAudioUnlock(currentVideo);
        return;
      }
      if (mode === "deep") await connectDfChain();
      else if (mode === "ml") await connectRnnoiseChain();
      else connectEqChain();
    } catch (e) {
      // All chain connections failed — ensure audio still plays unprocessed
      console.error("[Ripple Wave] Chain connection failed, bypassing:", e);
      try { connectBypass(); } catch (_) {}
    } finally {
      connecting = false;
      // A mode or intensity change arrived while we were connecting — apply it now
      if (_pendingReconnect) { _pendingReconnect = false; queueMicrotask(() => connectActive()); }
    }
  }

  function connectBypass() {
    disconnectAll();
    const ctx = _getAudioCtx();
    if (sourceNode && ctx) sourceNode.connect(ctx.destination);
  }

  // ─── Video Hooking ───
  function unhookVideo() {
    _pendingGestureVideo = null;
    _removeAudioUnlockListeners();
    _stopAudioClickDetection();
    disconnectAll();
    sourceNode = null;
    currentVideo = null;
  }

  function hookVideo(video) {
    if (!video || (video === currentVideo && sourceNode)) return;
    // Clean up old video reference before hooking new one
    if (currentVideo && currentVideo !== video) unhookVideo();
    currentVideo = video;
    disconnectAll();
    const ctx = _getAudioCtx();
    if (!ctx || ctx.state !== "running") {
      sourceNode = null;
      _armDeferredAudioUnlock(video);
      return;
    }
    if (_captureBlockedVideos.has(video)) {
      sourceNode = null;
      return;
    }
    try {
      if (!_videoSourceNodes.has(video)) {
        const createdSource = ctx.createMediaElementSource(video);
        _videoSourceNodes.set(video, createdSource);
        video._ytdeclicker_source = createdSource;
      }
    } catch (e) {
      // Another extension or context already captured this video element
      if (String(e?.message || "").includes("already connected previously")) {
        _captureBlockedVideos.add(video);
      }
      console.warn("[Ripple Wave] Cannot capture video audio:", e.message);
      currentVideo = null;
      sourceNode = null;
      return;
    }
    _pendingGestureVideo = null;
    _removeAudioUnlockListeners();
    sourceNode = _videoSourceNodes.get(video) || video._ytdeclicker_source || null;
    if (_getEffectiveActive()) connectActive();
    else {
      connectBypass();
      // Kick off audio-based click detection (runs only when not already active
      // and title heuristic didn't fire — sourceNode is now available).
      if (_sourceRuleOverride !== "never") _startAudioClickDetection();
    }
  }

  function _extractXHandleFromHref(href) {
    if (!href) return "";
    try {
      const url = new URL(href, location.origin);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return "";
      const candidate = parts[0].replace(/^@/, "");
      if (!candidate || X_RESERVED_HANDLES.has(candidate.toLowerCase())) return "";
      return candidate;
    } catch (e) {
      return "";
    }
  }

  function _closestAny(node, selectors) {
    if (!node) return null;
    const list = Array.isArray(selectors) ? selectors : [selectors];
    let cur = node;
    while (cur && cur !== document.documentElement) {
      if (cur.matches && list.some((selector) => cur.matches(selector))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function _cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function _getPathParts(href, allowedHosts) {
    try {
      const url = new URL(href, location.origin);
      if (allowedHosts && allowedHosts.length > 0) {
        const ok = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
        if (!ok) return [];
      }
      return url.pathname.split("/").filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function _queryParam(href, key) {
    try {
      return new URL(href, location.origin).searchParams.get(key) || "";
    } catch (e) {
      return "";
    }
  }

  function _makeSourceInfo(siteKey, rawId, name, iconUrl, sourceType) {
    const normalizedId = String(rawId || "").trim().toLowerCase();
    if (!normalizedId) return null;
    let safeIcon = iconUrl || "";
    if (!safeIcon.startsWith("https://")) safeIcon = "";
    const primaryKey = `${siteKey}:${normalizedId}`;
    return {
      id: primaryKey,
      // Only use the site-prefixed key for rule matching. An earlier build
      // also included the bare normalizedId for backward compat, but that
      // caused cross-site collisions (e.g. Twitch "foo" matching Kick "foo").
      ruleKeys: [primaryKey],
      name: _cleanText(name) || rawId,
      iconUrl: safeIcon,
      sourceType,
    };
  }

  function _getViewportIntersectionArea(rect, vw, vh) {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(vw, rect.right);
    const bottom = Math.min(vh, rect.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  // Cheaper than _isVisibleElement — skips getComputedStyle and uses a rect
  // we already need to compute for scoring. Used in tight scoring loops where
  // the extra style read would cause forced layout thrashing.
  function _isRectVisible(el, rect) {
    if (!el || !el.isConnected) return false;
    if (rect.width <= 0 && rect.height <= 0) return false;
    return true;
  }

  function _scoreVisibleVideo(video, ctx) {
    if (!video || !video.isConnected) return -Infinity;
    const rect = video.getBoundingClientRect();
    if (!_isRectVisible(video, rect)) return -Infinity;
    const area = Math.max(1, rect.width * rect.height);
    const viewportArea = _getViewportIntersectionArea(rect, ctx.vw, ctx.vh);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distFromCenter = Math.hypot(centerX - ctx.cx, centerY - ctx.cy);

    let score = 0;
    if (video === currentVideo) score += 500000;
    if (ctx.fsEl && ctx.fsEl.contains(video)) score += 400000;
    if (!video.paused) score += 300000;
    if (video.currentTime > 0) score += 100000;
    score += viewportArea;
    score += Math.min(area, 350000);
    score -= distFromCenter * 20;
    if (rect.bottom <= 0 || rect.top >= ctx.vh) score -= 500000;
    return score;
  }

  function _findBestVisibleVideo(selector = "video") {
    const videos = document.querySelectorAll(selector);
    if (videos.length === 0) return null;

    // Single-video fast path: the vast majority of YouTube/X/Twitch pages have
    // exactly one <video>. Avoid all scoring work in that case.
    if (videos.length === 1) return videos[0];

    // Cache viewport constants once per call instead of per-video, and share
    // the fullscreen element lookup. All three reads force layout if done
    // inside the loop.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ctx = {
      vw, vh,
      cx: vw / 2,
      cy: vh / 2,
      fsEl: document.fullscreenElement || null,
    };

    let bestVideo = null;
    let bestScore = -Infinity;
    for (const video of videos) {
      const score = _scoreVisibleVideo(video, ctx);
      if (score > bestScore) {
        bestScore = score;
        bestVideo = video;
      }
    }
    return bestVideo || videos[0] || null;
  }

  function _findXVideo() {
    return _findBestVisibleVideo("article video, [data-testid='videoPlayer'] video, video");
  }

  function _findVideo() {
    // YouTube: standard video selector
    if (SITE === SITE_YOUTUBE) {
      return document.querySelector("video.html5-main-video, video");
    }
    // Reddit: shreddit-player wraps <video> inside an open Shadow DOM
    if (SITE === SITE_REDDIT) {
      const players = document.querySelectorAll("shreddit-player");
      for (const p of players) {
        const v = p.shadowRoot?.querySelector("video");
        if (v) return v;
      }
      // Fallback: old Reddit or embedded player
      return document.querySelector("video");
    }
    if (SITE === SITE_X) {
      return _findXVideo();
    }
    if (SITE === SITE_TWITCH || SITE === SITE_FACEBOOK || SITE === SITE_LINKEDIN || SITE === SITE_KICK) {
      return _findBestVisibleVideo("video");
    }
    return document.querySelector("video");
  }

  let _pendingHookVideos = []; // tracked so _stopHookWatch can clean up

  function _queueVideoHookOnReady(video, gen) {
    if (!video) return;
    if (video._ytdeclicker_pendingHookGen === gen) return;
    video._ytdeclicker_pendingHookGen = gen;
    const handler = () => {
      if (video._ytdeclicker_pendingHookGen !== gen) return;
      delete video._ytdeclicker_pendingHookGen;
      if (gen !== _hookWatchGen) return;
      if (!_isContextValid() || !_isVideoPage() || !video.isConnected) return;
      hookVideo(video);
    };
    video.addEventListener("loadedmetadata", handler, { once: true });
    // Store ref so we can remove stale listeners on navigation/stop.
    video._ytdeclicker_hookHandler = handler;
    _pendingHookVideos.push(video);
  }

  function _cleanupPendingHookListeners() {
    for (const v of _pendingHookVideos) {
      if (v._ytdeclicker_hookHandler) {
        try { v.removeEventListener("loadedmetadata", v._ytdeclicker_hookHandler); } catch (_) {}
        delete v._ytdeclicker_hookHandler;
      }
      delete v._ytdeclicker_pendingHookGen;
    }
    _pendingHookVideos = [];
  }

  function findAndHook(gen = _hookWatchGen) {
    const video = _findVideo();
    if (video) {
      // Non-YouTube sites often serve video from a different origin.
      // Only set crossOrigin before the video has started loading (readyState 0)
      // to avoid forcing a resource re-fetch that restarts playback.
      if (SITE !== SITE_YOUTUBE && !video.crossOrigin && video.readyState === 0) {
        video.crossOrigin = "anonymous";
      }
      if (video.readyState >= 1) {
        hookVideo(video);
        return true;
      }
      // Wait for metadata to load if video exists but isn't ready
      _queueVideoHookOnReady(video, gen);
      return true; // found video, will hook when ready
    }
    return false;
  }

  function _stopHookWatch() {
    try { _hookWatchObserver?.disconnect(); } catch (_) {}
    _hookWatchObserver = null;
    if (_hookWatchInterval) clearInterval(_hookWatchInterval);
    _hookWatchInterval = null;
    if (_hookWatchTimeout) clearTimeout(_hookWatchTimeout);
    _hookWatchTimeout = null;
    _hookPassRafPending = false;
    _cleanupPendingHookListeners();
  }

  function _runHookPass(gen) {
    if (gen !== _hookWatchGen || !_isContextValid()) {
      _stopHookWatch();
      return false;
    }
    if (!_isVideoPage()) {
      _stopHookWatch();
      unhookVideo();
      return false;
    }
    if (currentVideo && !currentVideo.isConnected) {
      unhookVideo();
    }
    // We always run findAndHook even when currentVideo is still connected.
    // On multi-video feed sites (X, Reddit, Facebook) the user may scroll to
    // a different video and we need to re-hook. hookVideo early-returns when
    // the best video is already the current one (video === currentVideo &&
    // sourceNode), so the cost is just the scoring loop — which is fast
    // thanks to single-video fast-path and cached viewport context.
    return findAndHook(gen);
  }

  // Coalesces rapid MutationObserver callbacks into a single rAF-batched pass.
  // Without this, Facebook/Reddit/X feeds fire hundreds of mutations per second
  // and each one re-runs the full video scoring loop with forced layout.
  function _scheduleHookPass(gen) {
    if (_hookPassRafPending) return;
    _hookPassRafPending = true;
    requestAnimationFrame(() => {
      _hookPassRafPending = false;
      if (gen !== _hookWatchGen) return;
      _runHookPass(gen);
    });
  }

  function _startHookWatch() {
    if (!_isContextValid()) return;
    _hookWatchGen += 1;
    const gen = _hookWatchGen;
    _stopHookWatch();

    if (!_isVideoPage()) {
      unhookVideo();
      return;
    }

    // Use a narrower observation root per site to reduce MutationObserver noise
    // on heavy pages (Facebook feeds, Reddit infinite scroll, etc.)
    const _siteObserveRoot = {
      [SITE_YOUTUBE]: () => document.querySelector("#content, #page-manager, ytd-app"),
      [SITE_REDDIT]:  () => document.querySelector("shreddit-app, [id='main-content'], main"),
      [SITE_X]:       () => document.querySelector("main[role='main'], main"),
      [SITE_TWITCH]:  () => document.querySelector("main, [data-a-target='player-overlay-click-handler']")?.closest("main, section") || document.querySelector("main"),
      [SITE_FACEBOOK]:() => document.querySelector("[role='main'], main"),
      [SITE_LINKEDIN]:() => document.querySelector("main[role='main'], main"),
      [SITE_KICK]:    () => document.querySelector("main, #main-container"),
    };
    const root = _siteObserveRoot[SITE]?.() || document.body || document.documentElement;
    _runHookPass(gen);

    if (!root) return;

    _hookWatchObserver = new MutationObserver(() => _scheduleHookPass(gen));
    _hookWatchObserver.observe(root, { childList: true, subtree: true });

    // Fallback poll: backstops the MutationObserver for regions it can't see
    // (e.g. Reddit's shreddit-player shadow DOM). Runs at 1.5s — much slower
    // than before because the observer handles the fast path.
    _hookWatchInterval = setInterval(() => _runHookPass(gen), HOOK_WATCH_POLL_MS);

    _hookWatchTimeout = setTimeout(() => {
      if (gen !== _hookWatchGen) return;
      _stopHookWatch();
    }, HOOK_WATCH_TIMEOUT_MS);
  }

  // ─── Clicky Video Detection ───
  // Keywords are organized by topic so users can toggle categories on/off from the popup.
  // Topic names must match the BUILTIN_TOPICS array in popup.js exactly.
  const DETECT_TOPIC_KEYWORDS = {
    "Mechanical keyboards": [
      "mechanical keyboard", "clicky keyboard", "clicky keys", "keyboard sounds",
      "keyboard noise", "keyboard asmr", "typing asmr", "keyboard typing",
      "keyboard test", "keyboard review", "keyboard unboxing", "keycaps review",
      "keycaps unboxing", "key clicks", "key clacks", "switch sounds",
      "clicky switches", "tactile switches", "linear switches",
      "cherry mx", "gateron", "holy pandas", "topre", "zealios", "boba u4",
      "membrane vs mechanical", "switch comparison", "switch test",
      "typewriter sounds", "typewriter asmr",
    ],
    "Competitive programming": [
      "leetcode", "codeforces", "atcoder", "hackerrank", "codechef",
      "spoj", "topcoder", "kattis", "advent of code",
      "competitive programming", "competitive coding",
      "100 days of code", "30 days of code", "100 days of leetcode",
      "daily leetcode", "daily coding problem", "daily algorithm",
      "blind 75", "grind 75", "neetcode 150",
      "cp tutorial", "competitive programming tutorial",
      "icpc preparation", "olympiad programming", "programming contest",
      "contest solution", "editorial solution", "editorial code",
    ],
    "Vim / Neovim / Emacs": [
      "vim tutorial", "vim setup", "vim config", "vim tips", "vim motions",
      "vim keybindings", "vim plugin", "vim workflow", "vimrc",
      "neovim", "nvim", "emacs tutorial", "emacs setup", "emacs config",
      "emacs lisp", "helix editor", "kakoune",
    ],
    "Terminal / CLI / Shell": [
      "bash scripting", "bash script", "bash tutorial", "bash programming",
      "shell scripting", "shell script", "shell programming",
      "zsh config", "zsh setup", "zsh tutorial", "zsh plugins",
      "fish shell tutorial", "fish shell config",
      "linux commands", "linux terminal", "linux command line", "linux cli",
      "command line tutorial", "command line tools", "cli tutorial",
      "terminal tutorial", "terminal commands", "terminal workflow",
      "tmux tutorial", "tmux config", "tmux setup", "tmux workflow",
      "awk tutorial", "sed tutorial", "grep tutorial",
      "ssh tutorial", "ssh config", "rsync tutorial", "cron job", "cron tutorial",
    ],
    "Live coding interviews": [
      "coding interview", "mock coding interview", "live coding interview",
      "technical interview coding", "whiteboard coding",
      "faang interview code", "faang coding", "interview prep code",
      "system design code", "coding assessment",
    ],
    "DSA implementations": [
      "implement binary search", "implement linked list", "implement binary tree",
      "implement bst", "implement avl", "implement red black tree",
      "implement stack", "implement queue", "implement deque",
      "implement heap", "implement priority queue",
      "implement hash map", "implement hash table", "implement hash set",
      "implement trie", "implement graph", "implement lru cache",
      "implement segment tree", "implement fenwick", "implement disjoint set",
      "code binary search", "code linked list", "code binary tree",
      "code bst", "code heap", "code trie", "code graph",
      "coding binary search", "coding linked list", "coding binary tree",
      "write binary search", "write linked list",
      "sorting algorithm code", "sort in python", "sort in java",
      "sort in c++", "sort in javascript", "sort in go",
      "dsa in python", "dsa in java", "dsa in c++",
      "dsa in javascript", "dsa in go", "dsa in rust",
      "dsa in kotlin", "dsa in swift", "dsa in typescript",
      "data structures in python", "data structures in java",
      "data structures in c++", "data structures in javascript",
      "algorithms in python", "algorithms in java",
      "algorithms in c++", "algorithms in javascript",
      "dynamic programming solution", "dp solution", "dp code",
      "greedy solution", "backtracking solution",
    ],
    "Live coding sessions": [
      "live coding", "coding live", "code with me", "coding with me",
      "coding session", "coding stream", "programming live", "programming with me",
      "pair programming", "mob programming", "building in public",
      "live hackathon", "hackathon coding", "24 hour build", "48 hour build",
      "coding challenge live",
      "react live coding", "react coding session", "react live stream", "react live",
      "vue live coding", "vue live stream", "angular live coding", "angular live",
      "typescript live", "javascript live coding", "js live coding",
      "node live coding", "node.js live", "python live coding",
      "rust live coding", "rust coding session", "rust live stream",
      "golang live coding", "go live coding", "kotlin live coding",
      "swift live coding", "c++ live coding", "cpp live coding",
      "next.js live coding", "nextjs live", "svelte live coding",
      "flutter live coding", "react native live coding",
      "backend live coding", "frontend live coding", "full stack live coding",
      "web dev live", "devlog", "dev vlog", "coding vlog",
    ],
    "Framework tutorials": [
      "django tutorial", "flask tutorial", "fastapi tutorial",
      "spring boot tutorial", "express tutorial", "nestjs tutorial",
      "laravel tutorial", "rails tutorial", "ruby on rails tutorial",
      "crud tutorial", "crud application tutorial",
      "rest api tutorial", "graphql tutorial", "trpc tutorial",
      "sql tutorial", "postgresql tutorial", "mysql tutorial",
      "mongodb tutorial", "redis tutorial", "prisma tutorial",
      "full stack tutorial", "full stack project",
      "todo app tutorial", "todo list tutorial",
    ],
    "DSA courses & lectures": [
      "dsa tutorial", "dsa course", "dsa lecture", "dsa full course",
      "dsa for beginners", "dsa problem", "dsa series",
      "data structures tutorial", "data structures course", "data structures lecture",
      "data structures and algorithms", "algorithms and data structures",
      "algorithms tutorial", "algorithms course", "algorithms lecture",
      "algorithm visualized", "algorithm explained with code",
      "dynamic programming tutorial", "dynamic programming problem",
      "dynamic programming course", "dp tutorial", "dp problem", "dp series",
      "memoization tutorial", "tabulation tutorial",
      "graph algorithm", "graph traversal", "bfs dfs", "breadth first search code",
      "depth first search code", "dijkstra code", "bellman ford code",
      "floyd warshall code", "topological sort code", "shortest path code",
      "minimum spanning tree code", "kruskal code", "prim code",
      "binary search tutorial", "binary search problem",
      "linked list tutorial", "linked list problem",
      "binary tree tutorial", "binary tree problem",
      "bst tutorial", "heap tutorial", "trie tutorial",
      "segment tree tutorial", "fenwick tree tutorial", "bit tutorial",
      "union find tutorial", "disjoint set tutorial",
      "recursion tutorial", "backtracking tutorial", "backtracking problem",
      "greedy algorithm tutorial", "greedy problem",
      "divide and conquer tutorial", "two pointer tutorial",
      "sliding window tutorial", "prefix sum tutorial",
      "bit manipulation tutorial", "bitwise tutorial",
      "string algorithm", "pattern matching algorithm",
      "time complexity tutorial", "space complexity tutorial", "big o notation code",
    ],
    "DevOps / infrastructure": [
      "docker tutorial", "docker compose tutorial",
      "kubernetes tutorial", "k8s tutorial",
      "ansible tutorial", "terraform tutorial",
      "github actions tutorial", "gitlab ci tutorial", "ci cd tutorial",
      "aws cli", "gcloud tutorial", "azure cli",
      "linux administration", "linux sysadmin", "nginx tutorial", "apache tutorial",
    ],
    "Study / work with me": [
      "study with me", "work with me", "pomodoro session", "deep work session",
      "coding day", "coding night", "coding late night", "overnight coding",
      "day in the life developer", "day in the life programmer",
      "day in the life software engineer", "developer day in the life",
      "software engineer day", "programmer day", "freelance developer day", "indie dev vlog",
      "desk setup", "battlestation", "battle station",
      "workstation setup", "home office setup", "setup tour", "workspace tour",
      "coding setup", "developer setup", "programmer setup",
    ],
    "Coding challenges": [
      "coding challenge", "daily coding challenge", "coding problem", "algorithm problem",
    ],
    "ASMR coding": [
      "asmr coding", "coding asmr", "programming asmr", "developer asmr",
    ],
  };

  let _clickyBanner = null;
  let _clickyDetectionDone = false;
  let _clickyAudioTimer = null;
  let _clickyAnalyser = null;  // module-level so cleanup can reach it across function boundaries
  let _detectionGen = 0;       // incremented each runClickyDetection call to invalidate stale ticks

  function _getXTweetArticle(video = currentVideo) {
    if (video?.isConnected) {
      const parentArticle = video.closest("article");
      if (parentArticle) return parentArticle;
    }

    const fallbackVideo = _findXVideo();
    if (fallbackVideo?.isConnected) {
      const fallbackArticle = fallbackVideo.closest("article");
      if (fallbackArticle) return fallbackArticle;
    }

    return _queryFirstVisible(["article[data-testid='tweet']", "article"]) || document.querySelector("article");
  }

  function _getOgTitle() {
    const meta = document.querySelector('meta[property="og:title"]');
    return meta?.getAttribute("content") || "";
  }

  function _getVideoTitle() {
    let el;
    if (SITE === SITE_REDDIT) {
      const post = document.querySelector("shreddit-post");
      const t = post?.getAttribute("post-title");
      if (t) return t.toLowerCase().trim();
      el = document.querySelector("h1[slot='title']") || document.querySelector("h1");
    } else if (SITE === SITE_X) {
      const article = _getXTweetArticle();
      const tweetText = article?.querySelector("[data-testid='tweetText']");
      const tweetTitle = (tweetText?.textContent || "").toLowerCase().trim();
      if (tweetTitle) return tweetTitle;
      el = article?.querySelector("[data-testid='User-Name']") || document.querySelector("title");
    } else if (SITE === SITE_YOUTUBE) {
      el =
        document.querySelector("ytd-watch-metadata h1 .yt-core-attributed-string") ||
        document.querySelector("h1.ytd-video-primary-info-renderer .yt-core-attributed-string") ||
        document.querySelector("#title h1 .yt-core-attributed-string") ||
        document.querySelector("h1.ytd-watch-metadata") ||
        document.querySelector("#title h1") ||
        // Shorts use a different title element
        document.querySelector("ytd-reel-player-header-renderer h2") ||
        document.querySelector("ytd-reel-player-overlay-renderer h2");
    } else {
      // Twitch, Facebook, LinkedIn, Kick — try og:title first (set by SSR),
      // then h1, then document.title as last resort
      const ogTitle = _getOgTitle();
      if (ogTitle) return ogTitle.toLowerCase().trim();
      el = document.querySelector("h1");
    }
    return (el?.textContent || document.title || "").toLowerCase().trim();
  }

  let _clickyBannerCleanup = null; // stores fullscreen-listener cleanup fn
  function _dismissClickyBanner(banner) {
    const b = banner || _clickyBanner;
    if (!b) return;
    b.style.opacity = "0";
    b.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => { try { b.remove(); } catch (_) {} }, 320);
    if (_clickyBanner === b) _clickyBanner = null;
    if (_clickyBannerCleanup) { _clickyBannerCleanup(); _clickyBannerCleanup = null; }
  }

  function _showClickyBanner() {
    const path = window.location.pathname;
    if (!_isVideoPage()) return;
    if (_clickyBanner || _getEffectiveActive() || _sourceRuleOverride === "never" || !document.body) return;

    const isShorts = path.startsWith("/shorts/");
    const banner = document.createElement("div");
    banner.id = "ytdc-clicky-banner";
    banner.style.cssText = [
      "position:fixed", isShorts ? "bottom:120px" : "bottom:72px", "left:50%",
      "transform:translateX(-50%) translateY(6px)",
      "background:#111", "color:#fff",
      "border:2px solid #4ade80", "border-radius:10px",
      "padding:9px 14px", "font-family:ui-monospace,monospace",
      "font-size:12px", "font-weight:700",
      "display:flex", "align-items:center", "gap:10px",
      "z-index:2147483647",
      "box-shadow:0 4px 24px rgba(0,0,0,0.5),0 0 0 1px rgba(74,222,128,0.3)",
      "opacity:0", "transition:opacity 0.25s ease,transform 0.25s ease",
      "pointer-events:auto", "user-select:none", "white-space:nowrap",
    ].join(";");

    const silenceBtn = document.createElement("button");
    silenceBtn.textContent = "SILENCE IT";
    silenceBtn.style.cssText = [
      "background:#4ade80", "color:#052e16", "border:none",
      "padding:5px 11px", "font-family:ui-monospace,monospace",
      "font-weight:700", "font-size:11px", "cursor:pointer",
      "border-radius:6px", "letter-spacing:0.5px",
    ].join(";");

    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "✕";
    dismissBtn.setAttribute("aria-label", "Dismiss");
    dismissBtn.style.cssText = [
      "background:none", "color:#9ca3af", "border:1px solid #374151",
      "padding:4px 7px", "font-family:ui-monospace,monospace",
      "font-size:11px", "cursor:pointer", "border-radius:6px",
    ].join(";");

    const label = document.createElement("span");
    label.textContent = "⌨  This video may have keyboard clicking";

    banner.appendChild(label);
    banner.appendChild(silenceBtn);
    banner.appendChild(dismissBtn);

    // Append to fullscreen element if active, otherwise document.body
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    (fsEl || document.body).appendChild(banner);
    _clickyBanner = banner;

    // Reparent banner into fullscreen element when user enters/exits fullscreen,
    // otherwise the banner gets hidden behind the fullscreen overlay.
    const _reparentBanner = () => {
      if (!banner.isConnected) return;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      const desiredParent = fsEl || document.body;
      if (banner.parentNode !== desiredParent) desiredParent.appendChild(banner);
    };
    document.addEventListener("fullscreenchange", _reparentBanner);
    document.addEventListener("webkitfullscreenchange", _reparentBanner);
    // Clean up the listener when banner is dismissed via _dismissClickyBanner.
    _clickyBannerCleanup = () => {
      document.removeEventListener("fullscreenchange", _reparentBanner);
      document.removeEventListener("webkitfullscreenchange", _reparentBanner);
    };

    // Fade in
    requestAnimationFrame(() => {
      banner.style.opacity = "1";
      banner.style.transform = "translateX(-50%) translateY(0)";
    });

    // Auto-dismiss after 8 seconds (longer for first-time users to read + decide)
    let autoTimer = setTimeout(() => _dismissClickyBanner(banner), 8000);

    // Pause auto-dismiss while user hovers the banner
    banner.addEventListener("mouseenter", () => clearTimeout(autoTimer));
    banner.addEventListener("mouseleave", () => {
      autoTimer = setTimeout(() => _dismissClickyBanner(banner), 3000);
    });

    silenceBtn.addEventListener("click", () => {
      clearTimeout(autoTimer);
      _dismissClickyBanner(banner);
      activate(); // handles _stopAudioClickDetection + isActive + connectActive + saveStateImmediate
    });

    dismissBtn.addEventListener("click", () => {
      clearTimeout(autoTimer);
      _dismissClickyBanner(banner);
    });
  }

  // Lightweight visibility check using bounding rect only. Avoids
  // getComputedStyle which forces a synchronous style recalc. display:none
  // elements have zero-size rects so they're correctly excluded.
  function _isVisibleElement(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function _queryFirstVisible(selectors, root = document) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of list) {
      const nodes = root.querySelectorAll(selector);
      for (const node of nodes) {
        if (_isVisibleElement(node)) return node;
      }
    }
    return null;
  }

  const _SOURCE_CONTAINER_SELECTORS = ["article", "[role='article']", "main", "[role='main']"];

  function _scoreSourceAnchor(anchor, ctx) {
    // NOTE: the caller has already confirmed the anchor is visible-ish and
    // matches the extractor. We skip _isVisibleElement here (which would
    // trigger getComputedStyle) and rely on the bounding rect instead.
    const ar = anchor.getBoundingClientRect();
    if (ar.width <= 0 && ar.height <= 0) return -Infinity;

    const text = _cleanText(anchor.textContent || anchor.getAttribute("aria-label") || anchor.title || "");
    let score = text ? Math.min(text.length, 48) : 0;
    if (anchor.querySelector("img")) score += 10;

    if (ctx.vr) {
      const vr = ctx.vr;
      const anchorCx = ar.left + ar.width / 2;
      const videoCx = vr.left + vr.width / 2;
      const dx = Math.abs(anchorCx - videoCx);
      const dy =
        ar.top > vr.bottom ? ar.top - vr.bottom :
        vr.top > ar.bottom ? vr.top - ar.bottom :
        0;
      score -= dx * 0.02;
      score -= dy * 0.05;
      if (ctx.videoContainer && _closestAny(anchor, _SOURCE_CONTAINER_SELECTORS) === ctx.videoContainer) {
        score += 25;
      }
    }

    return score;
  }

  // Bounded scan: on heavy feeds (Facebook, X) there can be thousands of
  // anchors. After the first MAX_CANDIDATES matches we stop — more anchors
  // rarely change the winner because the top score is dominated by proximity
  // to the video, which we already check.
  const _SOURCE_MAX_CANDIDATES = 120;

  function _findBestSourceCandidate(root, extractor, options = {}) {
    const selector = options.selector || "a[href]";
    const nameResolver = options.nameResolver || ((anchor) => _cleanText(anchor.textContent || anchor.getAttribute("aria-label") || anchor.title || ""));
    const iconResolver = options.iconResolver || ((anchor) => anchor.querySelector("img")?.src || "");
    const fallbackName = options.fallbackName || ((id) => id);
    const video = options.video || currentVideo;

    // Compute all video-relative values once. The old code read
    // video.getBoundingClientRect() and _closestAny(video, …) per anchor.
    const ctx = {
      vr: video?.isConnected ? video.getBoundingClientRect() : null,
      videoContainer: video?.isConnected ? _closestAny(video, _SOURCE_CONTAINER_SELECTORS) : null,
    };

    let best = null;
    let bestScore = -Infinity;
    let examined = 0;
    for (const anchor of root.querySelectorAll(selector)) {
      const id = extractor(anchor);
      if (!id) continue;
      const score = _scoreSourceAnchor(anchor, ctx) + (options.scoreBoost ? options.scoreBoost(anchor, id) : 0);
      if (score === -Infinity) continue;
      if (score > bestScore) {
        bestScore = score;
        best = {
          id,
          name: nameResolver(anchor) || fallbackName(id),
          iconUrl: iconResolver(anchor),
        };
      }
      if (++examined >= _SOURCE_MAX_CANDIDATES) break;
    }
    return best;
  }

  // Twitch and Kick both use single-segment channel URLs (e.g. /foo) with
  // reserved-path exclusion. Twitch additionally supports /popout/{channel}.
  function _extractStreamerChannelId(href, hosts, reservedSet, allowPopout) {
    const parts = _getPathParts(href, hosts);
    if (parts.length === 1 && !reservedSet.has(parts[0].toLowerCase())) return parts[0];
    if (allowPopout && parts[0] === "popout" && parts[1] && !reservedSet.has(parts[1].toLowerCase())) return parts[1];
    return "";
  }

  const _extractTwitchChannelId = (href) => _extractStreamerChannelId(href, ["twitch.tv"], TWITCH_RESERVED_PATHS, true);
  const _extractKickChannelId   = (href) => _extractStreamerChannelId(href, ["kick.com"],  KICK_RESERVED_PATHS,  false);

  function _extractLinkedInProfileId(href) {
    const parts = _getPathParts(href, ["linkedin.com"]);
    if ((parts[0] === "in" || parts[0] === "company" || parts[0] === "school") && parts[1]) {
      return `${parts[0]}:${parts[1]}`;
    }
    return "";
  }

  function _extractFacebookSourceId(href) {
    const parts = _getPathParts(href, ["facebook.com", "fb.watch"]);
    if (parts.length === 0) return "";

    if (parts[0] === "profile.php") {
      const profileId = _queryParam(href, "id");
      return profileId ? `profile:${profileId}` : "";
    }

    if (parts[0] === "people" && parts[2]) {
      return `people:${parts[2]}`;
    }

    if (parts[0] === "pages" && parts[2]) {
      return `page:${parts[2]}`;
    }

    if (parts.length === 1 && !FACEBOOK_RESERVED_PATHS.has(parts[0].toLowerCase())) {
      return `slug:${parts[0]}`;
    }

    return "";
  }

  function _getYouTubeChannelInfo() {
    const ownerRoot = _queryFirstVisible([
      "ytd-watch-metadata ytd-video-owner-renderer",
      "#above-the-fold ytd-video-owner-renderer",
      "ytd-reel-player-header-renderer",
      "ytd-reel-player-overlay-renderer ytd-channel-name",
    ]);

    const searchRoot = ownerRoot || document;
    const nameEl = _queryFirstVisible([
      "#owner-name a[href*='/@']",
      "#owner-name a[href*='/channel/']",
      "#channel-name a[href*='/@']",
      "#channel-name a[href*='/channel/']",
      "ytd-channel-name a[href*='/@']",
      "ytd-channel-name a[href*='/channel/']",
      "#owner-name a",
      "#channel-name a",
      "ytd-channel-name a",
    ], searchRoot);

    if (!nameEl) return null;
    const name = (nameEl.textContent || "").replace(/\s+/g, " ").trim();
    if (!name) return null;

    const href = nameEl.href || "";
    const id =
      href.match(/\/@([^/?#]+)/)?.[1] ||
      href.match(/\/channel\/([^/?#]+)/)?.[1] ||
      href.match(/\/c\/([^/?#]+)/)?.[1] ||
      href.match(/\/user\/([^/?#]+)/)?.[1] ||
      name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

    const iconEl = _queryFirstVisible([
      "#avatar-link img",
      "#avatar img",
      "yt-img-shadow img",
      "img.yt-core-image",
    ], searchRoot);

    return _makeSourceInfo(SITE_YOUTUBE, id, name, iconEl?.src || "", "channel");
  }

  function _getXAccountInfo() {
    const article = _getXTweetArticle();
    if (!article) return null;

    const userBlock = article.querySelector("[data-testid='User-Name']");
    const spanTexts = Array.from(userBlock?.querySelectorAll("span") || [])
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let handle = "";
    let name = "";

    const handleText = spanTexts.find((text) => text.startsWith("@"));
    if (handleText) handle = handleText.slice(1);

    const displayName = spanTexts.find((text) =>
      text &&
      !text.startsWith("@") &&
      text !== "·" &&
      text.toLowerCase() !== "follow"
    );
    if (displayName) name = displayName;

    if (!handle) {
      let bestAnchor = null;
      let bestHandle = "";
      let bestScore = -Infinity;
      let examined = 0;
      for (const anchor of article.querySelectorAll("a[href]")) {
        const href = anchor.getAttribute("href") || anchor.href || "";
        const candidateHandle = _extractXHandleFromHref(href);
        if (!candidateHandle) continue;

        const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
        let score = 0;
        if (text.includes("@")) score += 8;
        if (anchor.closest("[data-testid='User-Name']")) score += 10;
        if (anchor.querySelector("img")) score += 4;
        if (href.replace(/\/+$/, "") === `/${candidateHandle}`) score += 2;

        if (score > bestScore) {
          bestScore = score;
          bestHandle = candidateHandle;
          bestAnchor = anchor;
        }
        // Cap scan on dense tweets to avoid iterating hundreds of anchors
        if (++examined >= 50) break;
      }

      if (bestHandle) {
        handle = bestHandle;
        if (!name && bestAnchor) {
          const anchorText = (bestAnchor.textContent || "").replace(/\s+/g, " ").trim();
          if (anchorText && !anchorText.startsWith("@")) {
            name = anchorText.split("@")[0].trim();
          }
        }
      }
    }

    if (!handle) return null;
    if (!name) name = `@${handle}`;

    const iconEl = article.querySelector(
      "img[src*='profile_images'], [data-testid='Tweet-User-Avatar'] img, a[href^='/'] img"
    );

    return _makeSourceInfo(SITE_X, handle, name, iconEl?.src || "", "account");
  }

  // Shared implementation for Twitch + Kick channel info. Both use single-
  // segment channel URLs and the same scoring strategy — only the reserved
  // path set and the icon fallback selector differ.
  const _STREAMER_ROOT_SELECTORS = ["main", "[role='main']", "article", "section"];

  function _getStreamerChannelInfo({ siteKey, extractor, iconSelectors }) {
    const root = _closestAny(currentVideo, _STREAMER_ROOT_SELECTORS) || document.querySelector("main, [role='main']") || document;
    const pathId = extractor(location.href);
    const candidate = _findBestSourceCandidate(root, (anchor) => extractor(anchor.href || anchor.getAttribute("href") || ""), {
      scoreBoost: (_, id) => (pathId && id.toLowerCase() === pathId.toLowerCase() ? 100 : 0),
      fallbackName: (id) => id,
    });

    const iconEl = _queryFirstVisible(iconSelectors, root);

    const rawId = candidate?.id || pathId;
    const name = candidate?.name || pathId;
    return _makeSourceInfo(siteKey, rawId, name, candidate?.iconUrl || iconEl?.src || "", "creator");
  }

  const _TWITCH_ICON_SELECTORS = [
    "img[src*='static-cdn.jtvnw.net']",
    "img[alt*='channel' i]",
    "img[alt*='profile' i]",
  ];
  const _KICK_ICON_SELECTORS = [
    "img[src*='kick.com']",
    "img[alt*='channel' i]",
    "img[alt*='profile' i]",
  ];

  const _getTwitchChannelInfo = () => _getStreamerChannelInfo({
    siteKey: SITE_TWITCH,
    extractor: _extractTwitchChannelId,
    iconSelectors: _TWITCH_ICON_SELECTORS,
  });
  const _getKickChannelInfo = () => _getStreamerChannelInfo({
    siteKey: SITE_KICK,
    extractor: _extractKickChannelId,
    iconSelectors: _KICK_ICON_SELECTORS,
  });

  function _getLinkedInSourceInfo() {
    const root = _closestAny(currentVideo, ["article", "[role='article']", "main", "[role='main']", "section"]) || document.querySelector("article, [role='article'], main, [role='main']") || document;
    const candidate = _findBestSourceCandidate(root, (anchor) => _extractLinkedInProfileId(anchor.href || anchor.getAttribute("href") || ""), {
      selector: "a[href*='/in/'], a[href*='/company/'], a[href*='/school/']",
      fallbackName: (id) => id.split(":")[1] || id,
    });
    if (!candidate) return null;

    const sourceType = candidate.id.startsWith("company:") || candidate.id.startsWith("school:")
      ? "page"
      : "profile";

    return _makeSourceInfo(SITE_LINKEDIN, candidate.id, candidate.name, candidate.iconUrl || "", sourceType);
  }

  function _getFacebookSourceInfo() {
    const root = _closestAny(currentVideo, ["article", "[role='article']", "main", "[role='main']", "[data-pagelet]", "section"]) || document.querySelector("[role='article'], article, [role='main'], main") || document;
    const candidate = _findBestSourceCandidate(root, (anchor) => _extractFacebookSourceId(anchor.href || anchor.getAttribute("href") || ""), {
      selector: "a[href]",
      nameResolver: (anchor) => _cleanText(anchor.getAttribute("aria-label") || anchor.textContent || anchor.title || ""),
      fallbackName: (id) => id.replace(/^[^:]+:/, ""),
    });
    if (!candidate) return null;

    let sourceType = "profile";
    if (candidate.id.startsWith("page:") || candidate.id.startsWith("slug:")) sourceType = "page";
    if (candidate.id.startsWith("people:")) sourceType = "profile";

    return _makeSourceInfo(SITE_FACEBOOK, candidate.id, candidate.name, candidate.iconUrl || "", sourceType);
  }

  function _getChannelInfo() {
    if (SITE === SITE_REDDIT) {
      // Reddit: subreddit is the "channel"
      const post = document.querySelector("shreddit-post");
      const sub = post?.getAttribute("subreddit-prefixed-name"); // "r/SubName"
      if (!sub) {
        // Fallback: parse from URL /r/{subreddit}/comments/...
        const m = location.pathname.match(/^\/r\/([^/]+)/);
        if (!m) return null;
        // ID is lowercased for rule-matching; display name preserves original casing
        return _makeSourceInfo(SITE_REDDIT, m[1].toLowerCase(), "r/" + m[1], "", "subreddit");
      }
      const rawName = sub.replace(/^r\//, "");
      const id = rawName.toLowerCase();
      return _makeSourceInfo(SITE_REDDIT, id, sub, "", "subreddit");
    }

    if (SITE === SITE_X) {
      return _getXAccountInfo();
    }

    if (SITE === SITE_TWITCH) {
      return _getTwitchChannelInfo();
    }

    if (SITE === SITE_FACEBOOK) {
      return _getFacebookSourceInfo();
    }

    if (SITE === SITE_LINKEDIN) {
      return _getLinkedInSourceInfo();
    }

    if (SITE === SITE_KICK) {
      return _getKickChannelInfo();
    }

    return _getYouTubeChannelInfo();
  }

  // Matcher cache keyed on the stringified disabled-topic set. Building the
  // flat keyword list is O(total keywords) — doing it per navigation ×
  // retry-tick is wasteful when the set almost never changes.
  const _IGNORED_TITLES = new Set(["youtube", "x", "twitter", "reddit", "twitch", "facebook", "linkedin", "kick"]);
  let _topicMatcherCache = null; // { key, keywords }

  function _getBuiltinKeywords(disabledTopics) {
    const disabledSet = new Set(disabledTopics || []);
    // Stable cache key: topic order is fixed by Object.keys iteration order
    // and the keyword lists are constants, so the sorted disabled array fully
    // identifies the matcher.
    const key = Array.from(disabledSet).sort().join("|");
    if (_topicMatcherCache && _topicMatcherCache.key === key) {
      return _topicMatcherCache.keywords;
    }
    const keywords = [];
    for (const [topic, list] of Object.entries(DETECT_TOPIC_KEYWORDS)) {
      if (disabledSet.has(topic)) continue;
      for (const kw of list) keywords.push(kw);
    }
    _topicMatcherCache = { key, keywords };
    return keywords;
  }

  function _runTitleDetection(customKeywords, disabledTopics) {
    const title = _getVideoTitle();
    if (!title || _IGNORED_TITLES.has(title)) return false;

    const builtins = _getBuiltinKeywords(disabledTopics);
    for (let i = 0; i < builtins.length; i++) {
      if (title.includes(builtins[i])) return true;
    }
    for (let i = 0; i < customKeywords.length; i++) {
      if (title.includes(customKeywords[i])) return true;
    }
    return false;
  }

  function _stopAudioClickDetection() {
    if (_clickyAudioTimer) { clearInterval(_clickyAudioTimer); _clickyAudioTimer = null; }
    if (_clickyAnalyser) { try { _clickyAnalyser.disconnect(); } catch (_) {} _clickyAnalyser = null; }
  }

  function _getMatchingRuleEntry(rules, info) {
    if (!rules || !info) return null;
    const keys = Array.isArray(info.ruleKeys) && info.ruleKeys.length > 0
      ? info.ruleKeys
      : [info.id];
    for (const key of keys) {
      if (rules[key]) return { key, entry: rules[key] };
    }
    return null;
  }

  function _startAudioClickDetection() {
    if (!sourceNode || !audioCtx || _clickyDetectionDone || _getEffectiveActive() || _sourceRuleOverride === "never") return;

    // Stop any previous detection run before starting a new one.
    _stopAudioClickDetection();
    // Capture detection generation so stale intervals from a previous
    // navigation self-cancel instead of acting on the wrong video.
    const myGen = _detectionGen;

    _clickyAnalyser = audioCtx.createAnalyser();
    _clickyAnalyser.fftSize = 2048;
    _clickyAnalyser.smoothingTimeConstant = 0; // raw instantaneous data — needed for transient detection
    sourceNode.connect(_clickyAnalyser);

    const bufferLen = _clickyAnalyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLen);
    const nyquist = audioCtx.sampleRate / 2;
    const freqPerBin = nyquist / bufferLen;
    const lowBin = Math.floor(1000 / freqPerBin);   // 1 kHz
    const highBin = Math.ceil(6000 / freqPerBin);   // 6 kHz

    let prevBandEnergy = -100;
    let clickCount = 0;
    let cooldown = 0;
    let sample = 0;
    const MAX_SAMPLES = 40; // 4 s at 100 ms intervals

    _clickyAudioTimer = setInterval(() => {
      if (myGen !== _detectionGen || _clickyDetectionDone || _getEffectiveActive() || _sourceRuleOverride === "never") {
        _stopAudioClickDetection();
        return;
      }

      _clickyAnalyser.getFloatFrequencyData(dataArray);

      // Average energy in the click frequency band (1–6 kHz)
      let sum = 0;
      for (let i = lowBin; i <= highBin; i++) sum += dataArray[i];
      const bandEnergy = sum / (highBin - lowBin + 1);

      if (cooldown > 0) {
        cooldown--;
      } else {
        const spike = bandEnergy - prevBandEnergy;
        // Click signature: sudden rise > 12 dB AND band is active (> -55 dBFS)
        if (spike > 12 && bandEnergy > -55) {
          clickCount++;
          cooldown = 3; // skip 300 ms to avoid double-counting the same click
        }
      }
      prevBandEnergy = bandEnergy;
      sample++;

      if (sample >= MAX_SAMPLES || clickCount >= 3) {
        _stopAudioClickDetection();
        if (clickCount >= 3 && !_clickyDetectionDone) {
          _clickyDetectionDone = true;
          _showClickyBanner();
        }
      }
    }, 100);
  }

  async function runClickyDetection() {
    const gen = ++_detectionGen; // any tick from a previous run that still has a pending setTimeout will see gen !== _detectionGen and bail out
    _clickyDetectionDone = false;
    _stopAudioClickDetection();
    _dismissClickyBanner();
    // Reset the channel-rule override so the new detection run starts clean.
    // Without this, a stale "always"/"never" from the previous video persists
    // until a new rule match or timeout, causing incorrect routing.
    if (_setSourceRuleOverride(null)) _applyEffectiveRouting(true);

    const result = await _getExtensionSettings([
      "ytdc_autodetect",
      "ytdc_custom_keywords",
      "ytdc_channel_rules",
      "ytdc_disabled_topics",
    ]);

    // Guard: if another navigation happened while we were reading storage, abort
    if (gen !== _detectionGen) return;

    const autodetect  = result.ytdc_autodetect ?? true;
    const channelRules = result.ytdc_channel_rules || {};
    const disabledTopics = result.ytdc_disabled_topics || [];
    const customKws   = (result.ytdc_custom_keywords || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    // Retry loop: YouTube SPA populates channel name and title asynchronously.
    // We check both on each tick so the channel rule fires as soon as the DOM is ready.
    let _titleMatchedButNoChannel = false; // track if title fired before channel info was available
    const tick = (attempt) => {
      if (gen !== _detectionGen) return; // stale — a newer navigation has started

      // ── 1. Channel rule (highest priority — overrides autodetect + title match) ──
      // Channel rules can override even after _clickyDetectionDone is set by a title match,
      // because channel info may load after the title is already available.
      const ch = _getChannelInfo();
      const matchedRule = _getMatchingRuleEntry(channelRules, ch);
      if (!matchedRule && _setSourceRuleOverride(null)) {
        _applyEffectiveRouting(true);
      }
      if (ch && matchedRule) {
        const rule = matchedRule.entry.rule;
        _clickyDetectionDone = true;
        if (_isVideoPage()) {
          if (rule === "always") {
            const overrideChanged = _setSourceRuleOverride("always");
            _dismissClickyBanner(); // dismiss any title-based banner
            _stopAudioClickDetection();
            if (overrideChanged) _applyEffectiveRouting(true);
          } else if (rule === "ask" && !_titleMatchedButNoChannel) {
            if (_setSourceRuleOverride(null)) _applyEffectiveRouting(true);
            _showClickyBanner();
          } else if (rule === "never") {
            const overrideChanged = _setSourceRuleOverride("never");
            _stopAudioClickDetection();
            _dismissClickyBanner(); // override title-based banner
            if (overrideChanged) _applyEffectiveRouting(true);
          }
        } else {
          _setSourceRuleOverride(null);
          _dismissClickyBanner();
        }
        return;
      }

      if (_clickyDetectionDone) return; // already decided by a prior tick

      // ── 2. Keyword / audio heuristic (respects autodetect toggle) ─────────
      if (autodetect && !_getEffectiveActive() && !_hasSourceRuleDecision()) {
        if (_runTitleDetection(customKws, disabledTopics)) {
          _clickyDetectionDone = true;
          _titleMatchedButNoChannel = true;
          _showClickyBanner();
          // Don't return — let retries continue so channel rules can still override
        }
      }

      // Retry up to 5 × 500 ms = 2.5 s while SPA finishes painting channel + title
      if (attempt < 5) setTimeout(() => tick(attempt + 1), 500);
      // Audio detection kicks in separately once sourceNode is ready (hookVideo → _startAudioClickDetection)
    };
    tick(0);
  }

  function observe() {
    _startHookWatch();

    // Only add navigation listener once
    if (!navListenerAdded) {
      navListenerAdded = true;

      const _onNavigation = () => {
        if (!_isContextValid()) return;
        // Give worklet loads a fresh shot on each navigation — a transient
        // network hiccup shouldn't permanently blacklist a mode for the tab.
        if (_dfFailCount >= MAX_WORKLET_RETRIES) _dfFailCount = 0;
        if (_rnnoiseFailCount >= MAX_WORKLET_RETRIES) _rnnoiseFailCount = 0;
        _startHookWatch();
        runClickyDetection();
      };

      if (SITE === SITE_YOUTUBE) {
        window.addEventListener("yt-navigate-finish", _onNavigation);
      }

      if (
        SITE === SITE_REDDIT ||
        SITE === SITE_X ||
        SITE === SITE_TWITCH ||
        SITE === SITE_FACEBOOK ||
        SITE === SITE_LINKEDIN ||
        SITE === SITE_KICK
      ) {
        // These sites rely heavily on client-side navigation, so watch History API changes.
        const origPush = history.pushState.bind(history);
        const origReplace = history.replaceState.bind(history);
        history.pushState = function(...a) { origPush(...a); _onNavigation(); };
        history.replaceState = function(...a) { origReplace(...a); _onNavigation(); };
        window.addEventListener("popstate", _onNavigation);
      }
    }
  }

  // ─── Extension context invalidation guard ───
  // After an extension update, chrome.runtime becomes invalid. Detect and clean up
  // to prevent zombie closures, console errors, and leaked audio nodes.
  function _isContextValid() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
  }

  // ─── Actions ───
  function activate() {
    _stopAudioClickDetection(); // stop detection — we're activating
    isActive = true;
    _applyEffectiveRouting(true);
    saveStateImmediate();
  }

  function deactivate() {
    isActive = false;
    _applyEffectiveRouting(true);
    saveStateImmediate();
  }

  function _applyIntensityToChain() {
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
  }

  function setMode(newMode) {
    if (!["eq", "ml", "deep"].includes(newMode)) return;
    mode = newMode;
    if (_getEffectiveActive()) {
      connectActive(); // disconnectAll() inside handles destroy + null
    }
    saveStateImmediate();
  }

  function setIntensity(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return;
    intensity = Math.max(0, Math.min(100, n));
    _applyIntensityToChain();
    saveState();
  }

  // ─── Message Handling ───
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      // Defense-in-depth: only accept messages from our own extension
      if (sender.id !== chrome.runtime.id) return false;
      // Ignore messages without an action (e.g. progress updates from background)
      if (!msg.action) return false;
      const handleAsync = async () => {
        switch (msg.action) {
          case "activate": activate(); return { ok: true };
          case "deactivate": deactivate(); return { ok: true };
          case "setMode": setMode(msg.value); return { ok: true };
          case "setIntensity": setIntensity(msg.value); return { ok: true };
          case "getState": {
            // Assets are bundled with the extension — always available.
            dfAssetsDownloaded = true;
            return {
              active: isActive,
              effectiveActive: _getEffectiveActive(),
              mode,
              intensity,
              hooked: !!currentVideo,
              dfDownloaded: true,
            };
          }
          case "getChannelInfo":
            return _getChannelInfo();
          case "rerunDetection":
            _clickyDetectionDone = false;
            _stopAudioClickDetection();
            _dismissClickyBanner();
            runClickyDetection();
            return { ok: true };
        }
      };
      // Always call sendResponse — even on error — to prevent the popup from
      // hanging forever waiting on a broken async handler.
      handleAsync().then(sendResponse, (err) => {
        console.error("[Ripple Wave] Message handler failed:", err);
        try { sendResponse(null); } catch (_) {}
      });
      return true; // keep message channel open for async response
    });
  }

  const _handleSettingsChange = (changes) => {
    if (!_isContextValid()) return;

    let nextActive = isActive;
    let nextMode = mode;
    let nextIntensity = intensity;
    let changed = false;

    if (changes.ytdc_active && changes.ytdc_active.newValue !== undefined) {
      const incoming = !!changes.ytdc_active.newValue;
      if (incoming !== nextActive) {
        nextActive = incoming;
        changed = true;
      }
    }
    if (changes.ytdc_mode && changes.ytdc_mode.newValue !== undefined) {
      const incoming = changes.ytdc_mode.newValue;
      if (["eq", "ml", "deep"].includes(incoming) && incoming !== nextMode) {
        nextMode = incoming;
        changed = true;
      }
    }
    if (changes.ytdc_intensity && changes.ytdc_intensity.newValue !== undefined) {
      const incoming = Number(changes.ytdc_intensity.newValue);
      if (Number.isFinite(incoming)) {
        const clamped = Math.max(0, Math.min(100, incoming));
        if (clamped !== nextIntensity) {
          nextIntensity = clamped;
          changed = true;
        }
      }
    }

    if (!changed) return;

    const activeChanged = nextActive !== isActive;
    const modeChanged = nextMode !== mode;
    const intensityChanged = nextIntensity !== intensity;

    isActive = nextActive;
    mode = nextMode;
    intensity = nextIntensity;
    // No local write needed — the change originated from chrome.storage itself.

    if (intensityChanged) {
      _applyIntensityToChain();
    }

    if (activeChanged) {
      if (isActive) activate();
      else deactivate();
      return;
    }

    if (modeChanged && _getEffectiveActive()) {
      connectActive();
    }
  };

  if (globalThis.RippleWaveSettings?.watchSettings) {
    globalThis.RippleWaveSettings.watchSettings(_handleSettingsChange);
  } else if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      _handleSettingsChange(changes);
    });
  }

  // Channel rules aren't in SETTINGS_KEYS (they're a map, not a primitive
  // setting), so watchSettings filters them out. Subscribe directly so that
  // popup-side rule edits take effect on the current page without waiting
  // for the next navigation.
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      if (!_isContextValid()) return;
      if (!changes.ytdc_channel_rules) return;
      // Re-run detection against the new rules. runClickyDetection resets
      // _sourceRuleOverride and reapplies routing if the rule decision flips.
      runClickyDetection();
    });
  }

  // ─── Init ───
  // Settings are loaded from chrome.storage in the async init chain below.
  // No synchronous localStorage bootstrap — avoids cross-origin desync.

  function _startObserving() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { observe(); runClickyDetection(); });
    } else { observe(); runClickyDetection(); }
  }

  // Sequential init chain:
  // 1. Clean up legacy IDB asset cache + legacy localStorage key (fire-and-forget)
  // 2. Mark DeepFilter as available (assets are packaged with the extension)
  // 3. Read settings from chrome.storage and start observing
  // .catch ensures observe() always runs even if storage is broken
  _deleteLegacyAssetDB();
  _clearLegacyLocalState();
  dfAssetsDownloaded = true;
  _getExtensionSettings(["ytdc_active", "ytdc_mode", "ytdc_intensity"])
    .then((result) => {
      if (result.ytdc_mode !== undefined) mode = result.ytdc_mode;
      if (result.ytdc_intensity !== undefined) intensity = result.ytdc_intensity;
      if (result.ytdc_active !== undefined) isActive = result.ytdc_active;
      _startObserving();
    })
    .catch(e => {
      console.warn("[Ripple Wave] Init chain error, starting with defaults:", e);
      _startObserving();
    });
})();

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
      // Sync to chrome.storage.local so popup can read state when off YouTube
      try {
        chrome.storage.local.set({ ytdc_active: isActive, ytdc_mode: mode, ytdc_intensity: intensity });
      } catch (e) {}
    }, 300);
  }

  function saveStateImmediate() {
    if (_saveTimer) clearTimeout(_saveTimer);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ active: isActive, mode, intensity }));
    } catch (e) {}
    try {
      chrome.storage.local.set({ ytdc_active: isActive, ytdc_mode: mode, ytdc_intensity: intensity });
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

  // Import DF assets that were downloaded by the popup while off YouTube.
  // The background worker stored them as base64 in chrome.storage.local with
  // ytdc_df_staged=true. We decode and write them to IndexedDB, then clear the flag.
  async function importStagedAssets() {
    try {
      const result = await new Promise((resolve) =>
        chrome.storage.local.get(
          ["ytdc_df_staged", "_df3_wasm_transfer", "_df3_model_transfer"],
          resolve
        )
      );
      if (!result.ytdc_df_staged) return;

      const wasmB64 = result._df3_wasm_transfer;
      const modelB64 = result._df3_model_transfer;
      if (!wasmB64 || !modelB64) return;

      const decodeB64 = (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
      };

      await cacheSet("df3_wasm", decodeB64(wasmB64));
      await cacheSet("df3_model", decodeB64(modelB64));
      await cacheSet(ASSET_VERSION_KEY, CURRENT_ASSET_VERSION);
      dfAssetsDownloaded = true;

      // Clear staged flag and transfer data from storage
      chrome.storage.local.remove(["ytdc_df_staged", "_df3_wasm_transfer", "_df3_model_transfer"]);
    } catch (e) {
      console.warn("[YT DeClicker] Failed to import staged assets:", e);
    }
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
    else {
      connectBypass();
      // Kick off audio-based click detection (runs only when not already active
      // and title heuristic didn't fire — sourceNode is now available).
      _startAudioClickDetection();
    }
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

  // ─── Clicky Video Detection ───
  // HIGH_CONF: a single match is enough to show the banner.
  // MED_CONF:  compound multi-word phrases that strongly imply live keyboard use.
  //            Kept intentionally conservative — no standalone "tutorial" or "class"
  //            words that describe pre-recorded screencasts (high false-positive risk).
  // ── DETECT_KEYWORDS_HIGH ──────────────────────────────────────────────────
  // Any single match = show banner.
  // These are chosen so that P(keyboard sounds | keyword in title) > 90 %.
  const DETECT_KEYWORDS_HIGH = [
    // ── Explicit keyboard hardware / sounds ───────────────────────────────
    "mechanical keyboard", "clicky keyboard", "clicky keys", "keyboard sounds",
    "keyboard noise", "keyboard asmr", "typing asmr", "keyboard typing",
    "keyboard test", "keyboard review", "keyboard unboxing", "keycaps review",
    "keycaps unboxing", "key clicks", "key clacks", "switch sounds",
    "clicky switches", "tactile switches", "linear switches",
    "cherry mx", "gateron", "holy pandas", "topre", "zealios", "boba u4",
    "membrane vs mechanical", "switch comparison", "switch test",
    "typewriter sounds", "typewriter asmr",

    // ── Competitive-programming / problem-solving platforms ───────────────
    // Video title contains the platform name = someone solving problems live
    // = typing code the entire time. P ≈ 97 %.
    "leetcode", "codeforces", "atcoder", "hackerrank", "codechef",
    "spoj", "topcoder", "kattis", "advent of code",
    "competitive programming", "competitive coding",
    "100 days of code", "30 days of code", "100 days of leetcode",
    "daily leetcode", "daily coding problem", "daily algorithm",
    "blind 75", "grind 75", "neetcode 150",

    // ── Keyboard-heavy editor tutorials ───────────────────────────────────
    // Vim/Neovim tutorials demonstrate keyboard shortcuts throughout.
    // Every action is a key sequence. P ≈ 99 %.
    "vim tutorial", "vim setup", "vim config", "vim tips", "vim motions",
    "vim keybindings", "vim plugin", "vim workflow", "vimrc",
    "neovim", "nvim",          // any neovim video = keyboard focus
    "emacs tutorial", "emacs setup", "emacs config", "emacs lisp",
    "helix editor", "kakoune",

    // ── Terminal / CLI / shell content ────────────────────────────────────
    // Person is typing commands throughout — no mouse alternative.
    "bash scripting", "bash script", "bash tutorial", "bash programming",
    "shell scripting", "shell script", "shell programming",
    "zsh config", "zsh setup", "zsh tutorial", "zsh plugins",
    "fish shell tutorial", "fish shell config",
    "linux commands", "linux terminal", "linux command line", "linux cli",
    "command line tutorial", "command line tools", "cli tutorial",
    "terminal tutorial", "terminal commands", "terminal workflow",
    "tmux tutorial", "tmux config", "tmux setup", "tmux workflow",
    "awk tutorial", "sed tutorial", "grep tutorial",
    "ssh tutorial", "ssh config", "rsync tutorial",
    "cron job", "cron tutorial",

    // ── Live coding interviews ─────────────────────────────────────────────
    // Format requires typing a solution while explaining. P ≈ 98 %.
    "coding interview", "mock coding interview", "live coding interview",
    "technical interview coding", "whiteboard coding",
    "faang interview code", "faang coding", "interview prep code",
    "system design code", "coding assessment",

    // ── DSA implementations (explicit "implement / code / write" signal) ───
    // These title patterns guarantee the person is writing the data structure
    // or algorithm from scratch, not just explaining with slides/animations.
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
  ];

  // ── DETECT_KEYWORDS_MED ──────────────────────────────────────────────────
  // Any single match = show banner.
  // Multi-word compound phrases that strongly imply live keyboard use but
  // are slightly less certain than HIGH tier (P ≈ 70–90 %).
  // Intentionally excludes standalone generic words like "tutorial",
  // "class", or "course" — those describe format, not keyboard presence.
  const DETECT_KEYWORDS_MED = [
    // ── Generic live-coding patterns ──────────────────────────────────────
    "live coding", "coding live", "code with me", "coding with me",
    "coding session", "coding stream", "programming live", "programming with me",
    "pair programming", "mob programming", "building in public",
    "live hackathon", "hackathon coding", "24 hour build", "48 hour build",
    "live hackathon", "coding challenge live",

    // ── Language × live-coding compounds ─────────────────────────────────
    // "react tutorial" alone → 60 % (too many pre-recorded screencasts)
    // "react live coding" → 97 % → included here, or move to HIGH
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

    // ── DSA topics — P(keyboard | topic title) is high for CS content ─────
    // DSA instructors almost universally code live rather than using slides.
    // A "binary search tutorial" = instructor opens IDE and types code.
    "dsa tutorial", "dsa course", "dsa lecture", "dsa full course",
    "dsa for beginners", "dsa problem", "dsa series",
    "data structures tutorial", "data structures course", "data structures lecture",
    "data structures and algorithms", "algorithms and data structures",
    "algorithms tutorial", "algorithms course", "algorithms lecture",
    "algorithm visualized", "algorithm explained with code",
    // Dynamic programming (almost always coded live)
    "dynamic programming tutorial", "dynamic programming problem",
    "dynamic programming course", "dp tutorial", "dp problem", "dp series",
    "memoization tutorial", "tabulation tutorial",
    // Graph algorithms (complex enough that instructor types to explain)
    "graph algorithm", "graph traversal", "bfs dfs", "breadth first search code",
    "depth first search code", "dijkstra code", "bellman ford code",
    "floyd warshall code", "topological sort code", "shortest path code",
    "minimum spanning tree code", "kruskal code", "prim code",
    // Tree topics
    "binary search tutorial", "binary search problem",
    "linked list tutorial", "linked list problem",
    "binary tree tutorial", "binary tree problem",
    "bst tutorial", "heap tutorial", "trie tutorial",
    "segment tree tutorial", "fenwick tree tutorial", "bit tutorial",
    "union find tutorial", "disjoint set tutorial",
    // Misc DSA
    "recursion tutorial", "backtracking tutorial", "backtracking problem",
    "greedy algorithm tutorial", "greedy problem",
    "divide and conquer tutorial", "two pointer tutorial",
    "sliding window tutorial", "prefix sum tutorial",
    "bit manipulation tutorial", "bitwise tutorial",
    "string algorithm", "pattern matching algorithm",
    "time complexity tutorial", "space complexity tutorial",
    "big o notation code",

    // ── Competitive programming topics ────────────────────────────────────
    "cp tutorial", "competitive programming tutorial",
    "icpc preparation", "olympiad programming", "programming contest",
    "contest solution", "editorial solution", "editorial code",

    // ── Study / work-with-me sessions ─────────────────────────────────────
    "study with me", "work with me", "code with me",
    "pomodoro session", "deep work session", "coding day",
    "coding night", "coding late night", "overnight coding",
    "day in the life developer", "day in the life programmer",
    "day in the life software engineer", "developer day in the life",
    "software engineer day", "programmer day",
    "freelance developer day", "indie dev vlog",

    // ── Setup / desk content ──────────────────────────────────────────────
    "desk setup", "battlestation", "battle station",
    "workstation setup", "home office setup", "setup tour", "workspace tour",
    "coding setup", "developer setup", "programmer setup",

    // ── ASMR coding ───────────────────────────────────────────────────────
    "asmr coding", "coding asmr", "programming asmr", "developer asmr",

    // ── Framework / language project tutorials ────────────────────────────
    // These are predominantly live-coded; instructor types while explaining.
    "django tutorial", "flask tutorial", "fastapi tutorial",
    "spring boot tutorial", "express tutorial", "nestjs tutorial",
    "laravel tutorial", "rails tutorial", "ruby on rails tutorial",
    "crud tutorial", "crud application tutorial",
    "rest api tutorial", "graphql tutorial", "trpc tutorial",
    "sql tutorial", "postgresql tutorial", "mysql tutorial",
    "mongodb tutorial", "redis tutorial", "prisma tutorial",
    "full stack tutorial", "full stack project",
    "todo app tutorial", "todo list tutorial",   // classic beginner projects

    // ── DevOps / infrastructure (terminal heavy throughout) ───────────────
    "docker tutorial", "docker compose tutorial",
    "kubernetes tutorial", "k8s tutorial",
    "ansible tutorial", "terraform tutorial",
    "github actions tutorial", "gitlab ci tutorial", "ci cd tutorial",
    "aws cli", "gcloud tutorial", "azure cli",
    "linux administration", "linux sysadmin",
    "nginx tutorial", "apache tutorial",

    // ── Coding challenges / hackathons ────────────────────────────────────
    "coding challenge", "daily coding challenge",
    "coding problem", "algorithm problem",
  ];

  let _clickyBanner = null;
  let _clickyDetectionDone = false;
  let _clickyAudioTimer = null;

  function _getVideoTitle() {
    // YouTube SPA — title element may be any of these selectors
    const el =
      document.querySelector("ytd-watch-metadata h1 .yt-core-attributed-string") ||
      document.querySelector("h1.ytd-video-primary-info-renderer .yt-core-attributed-string") ||
      document.querySelector("#title h1 .yt-core-attributed-string") ||
      document.querySelector("h1.ytd-watch-metadata") ||
      document.querySelector("#title h1");
    return (el?.textContent || document.title || "").toLowerCase().trim();
  }

  function _dismissClickyBanner(banner) {
    const b = banner || _clickyBanner;
    if (!b) return;
    b.style.opacity = "0";
    b.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => { try { b.remove(); } catch (_) {} }, 320);
    if (_clickyBanner === b) _clickyBanner = null;
  }

  function _showClickyBanner() {
    if (_clickyBanner || isActive || !document.body) return;

    const banner = document.createElement("div");
    banner.id = "ytdc-clicky-banner";
    banner.style.cssText = [
      "position:fixed", "bottom:72px", "left:50%",
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
    document.body.appendChild(banner);
    _clickyBanner = banner;

    // Fade in
    requestAnimationFrame(() => {
      banner.style.opacity = "1";
      banner.style.transform = "translateX(-50%) translateY(0)";
    });

    // Auto-dismiss after 5 seconds
    const autoTimer = setTimeout(() => _dismissClickyBanner(banner), 5000);

    silenceBtn.addEventListener("click", () => {
      clearTimeout(autoTimer);
      _dismissClickyBanner(banner);
      // Activate extension immediately
      isActive = true;
      connectActive();
      saveStateImmediate();
    });

    dismissBtn.addEventListener("click", () => {
      clearTimeout(autoTimer);
      _dismissClickyBanner(banner);
    });
  }

  function _getChannelInfo() {
    // YouTube renders channel info in different elements depending on page version
    const nameEl =
      document.querySelector("#channel-name a") ||
      document.querySelector("ytd-channel-name a") ||
      document.querySelector("#owner-name a") ||
      document.querySelector("ytd-video-owner-renderer #channel-name a");

    if (!nameEl) return null;
    const name = (nameEl.textContent || "").trim();
    if (!name) return null;

    const href = nameEl.href || "";
    // Prefer stable @handle, fall back to /channel/UCxxxxx
    let id =
      href.match(/\/@([^/?#]+)/)?.[1] ||
      href.match(/\/channel\/([^/?#]+)/)?.[1] ||
      name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

    // Avatar: YouTube puts the channel photo in #avatar-link img
    const iconEl =
      document.querySelector("#avatar-link img") ||
      document.querySelector("ytd-video-owner-renderer #avatar img") ||
      document.querySelector("#owner #avatar img") ||
      document.querySelector("ytd-video-owner-renderer yt-img-shadow img");

    let iconUrl = iconEl?.src || "";
    if (!iconUrl.startsWith("https://")) iconUrl = "";

    return { id, name, iconUrl };
  }

  function _runTitleDetection(customKeywords) {
    const title = _getVideoTitle();
    if (!title || title === "youtube") return false;

    const allHigh = [...DETECT_KEYWORDS_HIGH, ...customKeywords];
    if (allHigh.some((kw) => title.includes(kw))) return true;
    // Medium: any single compound phrase (each is already multi-word, so one match suffices)
    if (DETECT_KEYWORDS_MED.some((kw) => title.includes(kw))) return true;
    return false;
  }

  function _startAudioClickDetection() {
    if (!sourceNode || !audioCtx || _clickyDetectionDone || isActive) return;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0; // raw instantaneous data — needed for transient detection
    sourceNode.connect(analyser);

    const bufferLen = analyser.frequencyBinCount;
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
      if (_clickyDetectionDone || isActive) {
        clearInterval(_clickyAudioTimer);
        try { analyser.disconnect(); } catch (_) {}
        return;
      }

      analyser.getFloatFrequencyData(dataArray);

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
        clearInterval(_clickyAudioTimer);
        try { analyser.disconnect(); } catch (_) {}
        if (clickCount >= 3 && !_clickyDetectionDone) {
          _clickyDetectionDone = true;
          _showClickyBanner();
        }
      }
    }, 100);
  }

  async function runClickyDetection() {
    _clickyDetectionDone = false;
    if (_clickyAudioTimer) { clearInterval(_clickyAudioTimer); _clickyAudioTimer = null; }
    _dismissClickyBanner();

    const result = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["ytdc_autodetect", "ytdc_custom_keywords", "ytdc_channel_rules"],
        resolve
      )
    );
    const autodetect  = result.ytdc_autodetect ?? true;
    const channelRules = result.ytdc_channel_rules || {};
    const customKws   = (result.ytdc_custom_keywords || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    // Retry loop: YouTube SPA populates channel name and title asynchronously.
    // We check both on each tick so the channel rule fires as soon as the DOM is ready.
    const tick = (attempt) => {
      if (_clickyDetectionDone) return;

      // ── 1. Channel rule (highest priority — overrides autodetect toggle) ──
      const ch = _getChannelInfo();
      if (ch && channelRules[ch.id]) {
        const rule = channelRules[ch.id].rule;
        _clickyDetectionDone = true;
        if (rule === "always" && !isActive) {
          isActive = true;
          connectActive();
          saveStateImmediate();
        } else if (rule === "ask") {
          _showClickyBanner();
        }
        // rule === "never" → _clickyDetectionDone = true, nothing shown
        return;
      }

      // ── 2. Keyword / audio heuristic (respects autodetect toggle) ─────────
      if (autodetect && !isActive) {
        if (_runTitleDetection(customKws)) {
          _clickyDetectionDone = true;
          _showClickyBanner();
          return;
        }
      }

      // Retry up to 5 × 500 ms = 2.5 s while SPA finishes painting channel + title
      if (attempt < 5) setTimeout(() => tick(attempt + 1), 500);
      // Audio detection kicks in separately once sourceNode is ready (hookVideo → _startAudioClickDetection)
    };
    tick(0);
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
      window.addEventListener("yt-navigate-finish", () => {
        setTimeout(findAndHook, 500);
        runClickyDetection(); // fresh detection on each new video
      });
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
          case "importStaged":
            await importStagedAssets();
            return { ok: true };
          case "deleteDf":
            await deleteDfAssets();
            return { ok: true };
          case "getChannelInfo":
            return _getChannelInfo();
        }
      };
      handleAsync().then(sendResponse);
      return true; // keep message channel open for async response
    });
  }

  // ─── Init ───
  loadState();          // sync read from localStorage
  checkAssetVersion();  // async — evicts stale IndexedDB cache if version changed

  // Import any DF assets staged by the popup while the user was off YouTube.
  // Must run before checkDfAssetsDownloaded so the flag reflects the import.
  importStagedAssets().then(() => checkDfAssetsDownloaded().then(d => { dfAssetsDownloaded = d; }));

  // Merge in any state changes made by the popup while off YouTube, then start
  // observing for a video element (deferred until the storage read completes to
  // avoid a race where the audio chain starts with the wrong mode/intensity).
  chrome.storage.local.get(["ytdc_active", "ytdc_mode", "ytdc_intensity"], (result) => {
    if (!chrome.runtime.lastError) {
      if (result.ytdc_mode !== undefined) mode = result.ytdc_mode;
      if (result.ytdc_intensity !== undefined) intensity = result.ytdc_intensity;
      if (result.ytdc_active !== undefined) isActive = result.ytdc_active;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { observe(); runClickyDetection(); });
    } else { observe(); runClickyDetection(); }
  });
})();

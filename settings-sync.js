(function () {
  "use strict";

  const SETTINGS_VERSION = 1;
  const SETTINGS_VERSION_KEY = "ytdc_settings_version";
  const SETTINGS_KEYS = [
    "ytdc_active",
    "ytdc_mode",
    "ytdc_intensity",
    "ytdc_autodetect",
    "ytdc_custom_keywords",
    "ytdc_disabled_topics",
    "ytdc_channel_rules",
  ];
  const ALL_SYNC_KEYS = [...SETTINGS_KEYS, SETTINGS_VERSION_KEY];
  const VALID_MODES = new Set(["eq", "ml", "deep"]);
  const VALID_RULES = new Set(["always", "ask", "never"]);

  let readyPromise = null;
  let pendingSyncPatch = {};
  let flushTimer = null;
  let flushPromise = null;
  let _syncFailCount = 0;
  const MAX_SYNC_RETRIES = 3;

  function getSyncArea() {
    return chrome.storage?.sync || chrome.storage?.local || null;
  }

  function getLocalArea() {
    return chrome.storage?.local || null;
  }

  function hasAnySettings(data) {
    return SETTINGS_KEYS.some((key) => data[key] !== undefined);
  }

  function normalizeString(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  function sanitizeChannelRules(rules) {
    if (!rules || typeof rules !== "object") return {};
    const out = {};
    for (const [rawId, rawValue] of Object.entries(rules)) {
      const id = normalizeString(rawId, 120);
      if (!id || !rawValue || typeof rawValue !== "object") continue;
      const name = normalizeString(rawValue.name, 120) || id;
      const rule = VALID_RULES.has(rawValue.rule) ? rawValue.rule : "ask";
      const nextValue = { name, rule };
      const iconUrl = normalizeString(rawValue.iconUrl, 500);
      if (iconUrl.startsWith("https://")) {
        nextValue.iconUrl = iconUrl;
      }
      out[id] = nextValue;
    }
    return out;
  }

  function sanitizeDisabledTopics(topics) {
    if (!Array.isArray(topics)) return [];
    const seen = new Set();
    const out = [];
    for (const topic of topics) {
      const normalized = normalizeString(topic, 80);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function sanitizeSettings(patch) {
    if (!patch || typeof patch !== "object") return {};
    const out = {};

    if ("ytdc_active" in patch) {
      out.ytdc_active = !!patch.ytdc_active;
    }
    if ("ytdc_mode" in patch && VALID_MODES.has(patch.ytdc_mode)) {
      out.ytdc_mode = patch.ytdc_mode;
    }
    if ("ytdc_intensity" in patch) {
      const numeric = Number(patch.ytdc_intensity);
      if (Number.isFinite(numeric)) {
        out.ytdc_intensity = Math.max(0, Math.min(100, Math.round(numeric)));
      }
    }
    if ("ytdc_autodetect" in patch) {
      out.ytdc_autodetect = !!patch.ytdc_autodetect;
    }
    if ("ytdc_custom_keywords" in patch) {
      out.ytdc_custom_keywords = normalizeString(patch.ytdc_custom_keywords, 4000);
    }
    if ("ytdc_disabled_topics" in patch) {
      out.ytdc_disabled_topics = sanitizeDisabledTopics(patch.ytdc_disabled_topics);
    }
    if ("ytdc_channel_rules" in patch) {
      out.ytdc_channel_rules = sanitizeChannelRules(patch.ytdc_channel_rules);
    }

    return out;
  }

  async function readArea(area, keys) {
    if (!area) return {};
    return await area.get(keys);
  }

  async function mirrorLocal(patch) {
    const localArea = getLocalArea();
    if (!localArea || !Object.keys(patch).length) return;
    await localArea.set(patch);
  }

  async function ensureReady() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const syncArea = getSyncArea();
      const localArea = getLocalArea();
      if (!syncArea || !localArea) return;

      const syncData = await readArea(syncArea, ALL_SYNC_KEYS);
      const sanitizedSync = sanitizeSettings(syncData);
      if (hasAnySettings(syncData) || syncData[SETTINGS_VERSION_KEY] !== undefined) {
        await mirrorLocal({ ...sanitizedSync, [SETTINGS_VERSION_KEY]: syncData[SETTINGS_VERSION_KEY] ?? SETTINGS_VERSION });
        return;
      }

      const localData = await readArea(localArea, SETTINGS_KEYS);
      const sanitizedLocal = sanitizeSettings(localData);
      if (!Object.keys(sanitizedLocal).length) return;

      await syncArea.set({ ...sanitizedLocal, [SETTINGS_VERSION_KEY]: SETTINGS_VERSION });
      await mirrorLocal({ ...sanitizedLocal, [SETTINGS_VERSION_KEY]: SETTINGS_VERSION });
    })().catch((error) => {
      console.warn("[Ripple Wave] Settings sync migration failed:", error);
    });
    return readyPromise;
  }

  async function flushPending() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (flushPromise) return flushPromise;

    const syncArea = getSyncArea();
    if (!syncArea) return;

    const patch = pendingSyncPatch;
    if (!Object.keys(patch).length) return;
    pendingSyncPatch = {};

    flushPromise = syncArea
      .set({ ...patch, [SETTINGS_VERSION_KEY]: SETTINGS_VERSION })
      .then(() => {
        _syncFailCount = 0; // reset on success
      })
      .catch((error) => {
        _syncFailCount++;
        if (_syncFailCount < MAX_SYNC_RETRIES) {
          // Re-queue the failed patch for retry, but let any NEW writes that
          // arrived during the flush take precedence (user's latest wins).
          pendingSyncPatch = { ...patch, ...pendingSyncPatch };
        }
        // After MAX_SYNC_RETRIES, drop the sync patch — local storage still has the data.
        // This prevents infinite retry when chrome.storage.sync quota is exceeded.
        throw error;
      })
      .finally(() => {
        flushPromise = null;
        if (Object.keys(pendingSyncPatch).length && !flushTimer) {
          flushTimer = setTimeout(() => {
            flushPending().catch(() => {});
          }, 600);
        }
      });

    return flushPromise;
  }

  function scheduleFlush(immediate) {
    if (immediate) {
      return flushPending();
    }
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushPending().catch(() => {});
    }, 600);
    return Promise.resolve();
  }

  async function getSettings(keys = SETTINGS_KEYS) {
    await ensureReady();

    const requestedKeys = Array.isArray(keys) ? keys : [keys];
    const syncArea = getSyncArea();
    const syncData = sanitizeSettings(await readArea(syncArea, requestedKeys));
    const pendingData = sanitizeSettings(pendingSyncPatch);

    const merged = {};
    for (const key of requestedKeys) {
      if (syncData[key] !== undefined) merged[key] = syncData[key];
      if (pendingData[key] !== undefined) merged[key] = pendingData[key];
    }

    if (Object.keys(merged).length > 0) return merged;

    const localData = sanitizeSettings(await readArea(getLocalArea(), requestedKeys));
    return localData;
  }

  async function setSettings(patch, options = {}) {
    await ensureReady();

    const sanitized = sanitizeSettings(patch);
    if (!Object.keys(sanitized).length) return sanitized;

    if (options.mirrorLocal !== false) {
      await mirrorLocal(sanitized);
    }

    pendingSyncPatch = { ...pendingSyncPatch, ...sanitized };
    await scheduleFlush(!!options.immediate);
    return sanitized;
  }

  function watchSettings(listener) {
    if (!chrome.storage?.onChanged) return () => {};

    const syncAreaName = getSyncArea() === getLocalArea() ? "local" : "sync";
    const handler = (changes, areaName) => {
      if (areaName !== syncAreaName) return;
      const filtered = {};
      for (const key of SETTINGS_KEYS) {
        if (!(key in changes)) continue;
        const nextChange = changes[key];
        filtered[key] = {
          oldValue: sanitizeSettings({ [key]: nextChange.oldValue })[key],
          newValue: sanitizeSettings({ [key]: nextChange.newValue })[key],
        };
      }
      if (Object.keys(filtered).length) {
        listener(filtered, areaName);
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  globalThis.RippleWaveSettings = {
    SETTINGS_KEYS,
    ensureReady,
    flushPending,
    getSettings,
    setSettings,
    watchSettings,
  };
})();

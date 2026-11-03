// Background worker: cookie-decline orchestration (DuckDuckGo autoconsent), GPC, and rule toggles.
import { evalSnippets } from "@duckduckgo/autoconsent";
import { filterCompactRules } from "../node_modules/@duckduckgo/autoconsent/lib/encoding.ts";
import compactRules from "@duckduckgo/autoconsent/rules/compact-rules.json";
import "../shared/defaults.js";

const DEFAULTS = globalThis.TT_DEFAULTS;

async function settings() {
  try {
    return Object.assign({}, DEFAULTS, await chrome.storage.sync.get(null));
  } catch {
    return Object.assign({}, DEFAULTS);
  }
}

function isPaused(s, url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (s.paused || []).some((p) => host === p || host.endsWith("." + p));
  } catch {
    return false;
  }
}

// ---------- GPC ----------
// Header: a static network ruleset. JS signal: a main-world script registered only while GPC is on,
// so navigator.globalPrivacyControl is in place before any page script runs.
// Main-world scripts are registered only while their feature is on, and paused sites are
// excluded by URL pattern. Nothing about on/off state is exposed to the page.
const MAIN_SCRIPTS = [
  { key: "gpc", id: "tt-gpc", js: ["content/gpc.js"], pauseExempt: true },
  { key: "notifications", id: "tt-notif", js: ["content/notif.js"] },
  { key: "autoplay", id: "tt-autoplay", js: ["content/autoplay.js"] }
];

function pausePatterns(paused) {
  const out = [];
  for (const h of paused) {
    if (!/^[a-z0-9.-]+$/i.test(h)) continue;
    out.push(`*://${h}/*`, `*://*.${h}/*`);
  }
  return out;
}

const PAUSE_RULE_ID = 1;
const SUB_RESOURCES = ["sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"];

async function applyToggles() {
  const s = await settings();
  const enable = [];
  const disable = [];
  (s.reddit ? enable : disable).push("reddit");
  (s.gpc ? enable : disable).push("gpc");
  (s.telemetry ? enable : disable).push("telemetry");
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: enable, disableRulesetIds: disable });
  } catch (e) {
    console.warn("AndItsGone: ruleset update failed", e);
  }
  // Paused sites: let their requests through the telemetry rules (GPC still applies).
  try {
    const paused = (s.paused || []).filter(Boolean);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [PAUSE_RULE_ID],
      addRules: paused.length ? [{
        id: PAUSE_RULE_ID,
        priority: 100,
        action: { type: "allow" },
        condition: { initiatorDomains: paused, resourceTypes: SUB_RESOURCES }
      }] : []
    });
  } catch (e) {
    console.warn("AndItsGone: pause rule update failed", e);
  }
  // Re-register main-world scripts to match settings. GPC stays on for paused sites:
  // sending "do not sell" never breaks a page.
  try {
    const ids = MAIN_SCRIPTS.map((m) => m.id);
    const existing = (await chrome.scripting.getRegisteredContentScripts({ ids })).map((r) => r.id);
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing });
    const exclude = pausePatterns((s.paused || []).filter(Boolean));
    const scripts = MAIN_SCRIPTS.filter((m) => s[m.key]).map((m) => {
      const reg = { id: m.id, js: m.js, matches: ["<all_urls>"], runAt: "document_start", world: "MAIN", allFrames: true };
      if (!m.pauseExempt && exclude.length) reg.excludeMatches = exclude;
      return reg;
    });
    if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
  } catch (e) {
    console.warn("AndItsGone: script registration failed", e);
  }
}

chrome.runtime.onInstalled.addListener(applyToggles);
chrome.runtime.onStartup.addListener(applyToggles);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.reddit || changes.gpc || changes.telemetry || changes.paused || changes.notifications || changes.autoplay)) applyToggles();
});

// ---------- Cookie declines ----------
const CONSENT_CONFIG = {
  autoAction: "optOut",
  enablePrehide: true,
  enableCosmeticRules: true,
  enableGeneratedRules: true,
  enableHeuristicDetection: true,
  heuristicMode: "tier1", // reject or dismiss only; never clicks a lone "Accept"
  logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false }
};

async function bumpCount(tabId) {
  try {
    const key = "declined-" + tabId;
    const n = ((await chrome.storage.session.get(key))[key] || 0) + 1;
    await chrome.storage.session.set({ [key]: n });
    await chrome.action.setBadgeBackgroundColor({ color: "#2a5db0", tabId });
    await chrome.action.setBadgeText({ text: "✓", tabId });
  } catch {}
}

chrome.tabs.onRemoved.addListener((tabId) => {
  try { chrome.storage.session.remove(["declined-" + tabId, "hidden-" + tabId]); } catch {}
});

// Popup asks for rules to be applied before it reloads the page.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "tt-apply" || !(sender.url || "").startsWith(chrome.runtime.getURL(""))) return;
  applyToggles().then(() => sendResponse(true), () => sendResponse(false));
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab && sender.tab.id;
  const frameId = sender.frameId || 0;
  if (tabId == null || !msg || typeof msg.type !== "string") return;
  const reply = (m) => chrome.tabs.sendMessage(tabId, m, { frameId }).catch(() => {});

  (async () => {
    switch (msg.type) {
      case "init": {
        const s = await settings();
        const topUrl = sender.tab.url || sender.url;
        const enabled = !!s.cookies && !isPaused(s, topUrl);
        reply({
          type: "initResp",
          config: Object.assign({}, CONSENT_CONFIG, { enabled }),
          rules: enabled
            ? { autoconsent: [], compact: filterCompactRules(compactRules, { url: sender.url, mainFrame: frameId === 0 }) }
            : { autoconsent: [] }
        });
        break;
      }
      case "eval": {
        let result = false;
        try {
          const fn = evalSnippets[msg.snippetId];
          if (fn) {
            const [r] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, world: "MAIN", func: fn });
            result = r && r.result;
          }
        } catch {}
        reply({ type: "evalResp", id: msg.id, result });
        break;
      }
      case "tt-banner-hidden":
        try { await chrome.storage.session.set({ ["hidden-" + tabId]: true }); } catch {}
        break;
      case "optOutResult":
        if (msg.result) bumpCount(tabId);
        break;
    }
  })();
});

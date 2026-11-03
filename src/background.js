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
    return !!globalThis.TT_PAUSED_HOST(s.paused, host);
  } catch {
    return false;
  }
}

// ---------- GPC ----------
// Header: a static network ruleset. JS signal: a main-world script registered only while GPC is on,
// so navigator.globalPrivacyControl is in place before any page script runs.
// Top-frame hooks run early. Child frames ask the worker to check the top-level
// site's pause state before installing hooks. Page code can replace these hooks.
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
const PAUSE_NAV_RULE_ID = 2;
const SUB_RESOURCES = ["sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "other"];

// Run one update at a time: the popup and the settings listener can both trigger it at once,
// and overlapping unregister/register calls could leave the GPC script unregistered.
let applying = Promise.resolve();
function applyToggles() {
  applying = applying.then(applyTogglesNow, applyTogglesNow);
  return applying;
}

async function applyTogglesNow() {
  const s = await settings();
  let succeeded = true;
  const enable = [];
  const disable = [];
  (s.reddit ? enable : disable).push("reddit");
  (s.gpc ? enable : disable).push("gpc");
  (s.telemetry ? enable : disable).push("telemetry");
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: enable, disableRulesetIds: disable });
  } catch (e) {
    succeeded = false;
    console.warn("AndItsGone: ruleset update failed", e);
  }
  // Paused sites: let their requests through the telemetry rules (GPC still applies).
  try {
    const paused = (s.paused || []).filter(Boolean);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [PAUSE_RULE_ID, PAUSE_NAV_RULE_ID],
      addRules: paused.length ? [{
        id: PAUSE_RULE_ID,
        priority: 100,
        action: { type: "allow" },
        condition: { initiatorDomains: paused, resourceTypes: SUB_RESOURCES }
      }, {
        id: PAUSE_NAV_RULE_ID,
        priority: 100,
        action: { type: "allow" },
        condition: { requestDomains: paused, resourceTypes: ["main_frame"] }
      }] : []
    });
  } catch (e) {
    succeeded = false;
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
      const reg = { id: m.id, js: m.js, matches: ["<all_urls>"], runAt: "document_start", world: "MAIN", allFrames: !!m.pauseExempt };
      if (!m.pauseExempt && exclude.length) reg.excludeMatches = exclude;
      return reg;
    });
    if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
  } catch (e) {
    succeeded = false;
    console.warn("AndItsGone: script registration failed", e);
  }
  return succeeded;
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
  heuristicMode: "reject", // ambiguous OK / Continue buttons can grant consent
  logs: { lifecycle: false, rulesteps: false, detectionsteps: false, evals: false, errors: false, messages: false, waits: false }
};

// Serialize status writes and navigation resets for each tab. Session storage
// survives worker suspension; document IDs keep late replies off the next page.
const tabWork = new Map();
function inTab(tabId, task) {
  const work = (tabWork.get(tabId) || Promise.resolve()).then(task, task);
  tabWork.set(tabId, work);
  const done = () => { if (tabWork.get(tabId) === work) tabWork.delete(tabId); };
  work.then(done, done);
  return work;
}

async function clearStatus(tabId) {
  await chrome.storage.session.remove(["consent-" + tabId, "declined-" + tabId, "hidden-" + tabId]);
  await chrome.action.setBadgeText({ text: "", tabId });
}

chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId === 0) inTab(tabId, () => clearStatus(tabId)).catch(() => {});
});
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId }) => {
  if (frameId === 0) inTab(tabId, () => clearStatus(tabId)).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  inTab(tabId, () => chrome.storage.session.remove(["consent-" + tabId, "declined-" + tabId, "hidden-" + tabId])).catch(() => {});
});

async function recordStatus(sender, status) {
  const tabId = sender.tab.id;
  return inTab(tabId, async () => {
    const [top, frame] = await Promise.all([
      chrome.webNavigation.getFrame({ tabId, frameId: 0 }),
      chrome.webNavigation.getFrame({ tabId, frameId: sender.frameId || 0 })
    ]);
    if (!top || !frame || frame.url !== sender.url) return;
    if (sender.documentId && frame.documentId && sender.documentId !== frame.documentId) return;
    if (sender.documentLifecycle && sender.documentLifecycle !== "active") return;
    const s = await settings();
    if (!s.cookies || isPaused(s, top.url)) return;
    const key = "consent-" + tabId;
    const previous = (await chrome.storage.session.get(key))[key];
    const state = previous && previous.documentId === top.documentId && previous.url === top.url
      ? previous : { documentId: top.documentId, url: top.url };
    state[status] = (state[status] || 0) + 1;
    await chrome.storage.session.set({ [key]: state });
    if (state.declined) {
      await chrome.action.setBadgeBackgroundColor({ color: "#2a5db0", tabId });
      await chrome.action.setBadgeText({ text: "✓", tabId });
    }
  });
}

// Popup asks for rules to be applied before it reloads the page.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "tt-apply" || !(sender.url || "").startsWith(chrome.runtime.getURL(""))) return;
  applyToggles().then(sendResponse, () => sendResponse(false));
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
      case "tt-frame-init": {
        if (frameId === 0) break;
        const s = await settings();
        const top = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
        if (!top || isPaused(s, top.url) || isPaused(s, sender.url)) break;
        const files = MAIN_SCRIPTS.filter((m) => !m.pauseExempt && s[m.key]).flatMap((m) => m.js);
        if (files.length) await chrome.scripting.executeScript({
          target: sender.documentId ? { tabId, documentIds: [sender.documentId] } : { tabId, frameIds: [frameId] },
          world: "MAIN", files
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
        await recordStatus(sender, "hidden");
        break;
      case "tt-consent-status":
        if (["declined", "hidden", "attempted"].includes(msg.status)) await recordStatus(sender, msg.status);
        break;
    }
  })().catch((e) => console.warn("AndItsGone: content request failed", e));
});

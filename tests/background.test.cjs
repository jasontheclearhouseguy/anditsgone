const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const settle = () => new Promise(setImmediate);
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });

function host() {
  const state = { settings: {}, session: {}, scripts: [], injections: [], badges: [], frames: new Map(), warnings: [] };
  state.frames.set(0, { url: "https://example.com/", documentId: "top-1" });
  state.frames.set(1, { url: "https://player.example/", documentId: "child-1" });
  const chrome = {
    runtime: { getURL: p => "chrome-extension://test/" + p, onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: {
      sync: { get: async () => state.settings }, onChanged: event(),
      session: {
        get: async key => ({ [key]: state.session[key] }),
        set: async values => Object.assign(state.session, values),
        remove: async keys => keys.forEach(key => delete state.session[key])
      }
    },
    declarativeNetRequest: {
      updateEnabledRulesets: async r => { if (state.failRules) throw Error("rules failed"); state.rules = r; },
      updateDynamicRules: async r => { state.dynamic = r; }
    },
    scripting: {
      getRegisteredContentScripts: async () => state.scripts,
      unregisterContentScripts: async () => { state.scripts = []; },
      registerContentScripts: async r => { state.scripts = r; },
      executeScript: async r => { state.injections.push(r); return [{ result: true }]; }
    },
    tabs: { onRemoved: event(), sendMessage: async (tab, message) => { state.reply = message; } },
    webNavigation: { onCommitted: event(), onHistoryStateUpdated: event(), getFrame: async ({ frameId }) => state.frames.get(frameId) },
    action: { setBadgeText: async r => state.badges.push(r.text), setBadgeBackgroundColor: async () => {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "build/background.js"), "utf8"), {
    chrome, URL, console: { warn: (...args) => state.warnings.push(args) }
  });
  const sender = (frameId = 0) => ({ tab: { id: 7, url: state.frames.get(0).url }, frameId, ...state.frames.get(frameId), documentLifecycle: "active" });
  const message = async (msg, from = sender()) => {
    for (const fn of chrome.runtime.onMessage.listeners) fn(msg, from, value => { state.response = value; });
    await settle();
  };
  return { state, chrome, sender, message, apply: () => chrome.runtime.onInstalled.listeners[0]() };
}

test("only GPC is registered in every frame; cookie heuristics require rejection", async () => {
  const h = host();
  assert.equal(await h.apply(), true);
  assert.equal(h.state.scripts.find(s => s.id === "tt-gpc").allFrames, true);
  assert.equal(h.state.scripts.find(s => s.id === "tt-autoplay").allFrames, false);
  await h.message({ type: "init" });
  assert.equal(h.state.reply.config.heuristicMode, "reject");
  assert.equal(h.state.reply.config.autoAction, "optOut");
});

test("pause exempts destination navigations and retains higher-priority GPC", async () => {
  const h = host();
  h.state.settings = { paused: ["reddit.com"] };
  await h.apply();
  const rule = h.state.dynamic.addRules.find(r => r.condition.resourceTypes.includes("main_frame"));
  assert.equal(rule.condition.requestDomains[0], "reddit.com");
  assert.equal(rule.action.type, "allow");
  const reddit = JSON.parse(fs.readFileSync(path.join(root, "rules/reddit.json")));
  const gpc = JSON.parse(fs.readFileSync(path.join(root, "rules/gpc.json")));
  assert.ok(rule.priority > Math.max(...reddit.map(r => r.priority)));
  assert.ok(gpc[0].priority > rule.priority);
});

test("child hooks respect top-level and child-domain pauses", async () => {
  const h = host();
  h.state.settings = { paused: ["example.com"] };
  await h.message({ type: "tt-frame-init" }, h.sender(1));
  assert.equal(h.state.injections.length, 0);
  h.state.settings = { paused: ["player.example"] };
  await h.message({ type: "tt-frame-init" }, h.sender(1));
  assert.equal(h.state.injections.length, 0);
  h.state.settings = { notifications: false };
  await h.message({ type: "tt-frame-init" }, h.sender(1));
  assert.deepEqual(Array.from(h.state.injections[0].files), ["content/autoplay.js", "content/signin.js"]);
});

test("the Google sign-in hook registers in top frames only and follows its switch", async () => {
  const h = host();
  await h.apply();
  assert.equal(h.state.scripts.find(s => s.id === "tt-signin").allFrames, false);
  h.state.settings = { signin: false };
  await h.apply();
  assert.equal(h.state.scripts.find(s => s.id === "tt-signin"), undefined);
});

function signinPage({ active = false } = {}) {
  const calls = [];
  class CredentialsContainer { get(options) { calls.push(options); return Promise.resolve("credential"); } }
  const window = { CredentialsContainer };
  const context = { window, CredentialsContainer, navigator: { userActivation: { isActive: active } }, DOMException, Promise, String, Array };
  vm.runInNewContext(fs.readFileSync(path.join(root, "content/signin.js"), "utf8"), context);
  return { get: options => new CredentialsContainer().get(options), calls };
}
const google = (extra = {}) => ({ identity: { providers: [{ configURL: "https://accounts.google.com/gsi/fedcm.json", clientId: "x" }], ...extra } });

test("Google One Tap opened without a click is refused", async () => {
  const p = signinPage();
  await assert.rejects(p.get(google()), { name: "NetworkError" });
  assert.equal(p.calls.length, 0);
});

test("clicked and button-mode Google sign-in, other providers and passkeys pass through", async () => {
  assert.equal(await signinPage({ active: true }).get(google()), "credential");
  assert.equal(await signinPage().get(google({ mode: "active" })), "credential");
  assert.equal(await signinPage().get({ identity: { providers: [{ configURL: "https://idp.example/fedcm.json" }] } }), "credential");
  assert.equal(await signinPage().get({ publicKey: { challenge: new Uint8Array(1) } }), "credential");
  assert.equal(await signinPage().get({ identity: { providers: [{ configURL: "https://accounts.google.com.evil.example/fedcm.json" }] } }), "credential");
});

test("raw rule success cannot mark cookies declined; cosmetic results stay hidden", async () => {
  const h = host();
  await h.message({ type: "optOutResult", result: true });
  assert.deepEqual(h.state.session, {});
  await h.message({ type: "tt-consent-status", status: "hidden" });
  assert.equal(h.state.session["consent-7"].hidden, 1);
  assert.equal(h.state.session["consent-7"].declined, undefined);
  assert.equal(h.state.badges.length, 0);
});

test("navigation clears the badge and rejects delayed results even at the same URL", async () => {
  const h = host();
  const old = h.sender();
  await h.message({ type: "tt-consent-status", status: "declined" });
  assert.equal(h.state.session["consent-7"].documentId, "top-1");
  assert.equal(h.state.badges.at(-1), "✓");
  h.state.frames.set(0, { ...h.state.frames.get(0), documentId: "top-2" });
  h.chrome.webNavigation.onCommitted.listeners[0]({ tabId: 7, frameId: 0 });
  await h.message({ type: "tt-consent-status", status: "declined" }, old);
  assert.deepEqual(h.state.session, {});
  assert.equal(h.state.badges.at(-1), "");
});

test("history navigation, disabled cookies, and paused tabs do not retain success", async () => {
  const h = host();
  await h.message({ type: "tt-consent-status", status: "declined" });
  h.chrome.webNavigation.onHistoryStateUpdated.listeners[0]({ tabId: 7, frameId: 0 });
  await settle();
  assert.deepEqual(h.state.session, {});
  h.state.settings = { cookies: false };
  await h.message({ type: "tt-consent-status", status: "declined" });
  assert.deepEqual(h.state.session, {});
  h.state.settings = { paused: ["example.com"] };
  await h.message({ type: "tt-banner-hidden" });
  assert.deepEqual(h.state.session, {});
});

test("popup receives failure when a rules update fails", async () => {
  const h = host();
  h.state.failRules = true;
  await h.message({ type: "tt-apply" }, { url: "chrome-extension://test/popup/popup.html" });
  assert.equal(h.state.response, false);
});

test("pause matching inherits parent domains but respects hostname boundaries", () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "shared/defaults.js"), "utf8"), context);
  assert.equal(context.TT_PAUSED_HOST(["example.com"], "shop.example.com"), "example.com");
  assert.equal(context.TT_PAUSED_HOST(["example.com"], "notexample.com"), undefined);
});

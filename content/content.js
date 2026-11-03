// Isolated-world content script: redirects, CSS hiding, and overlay heuristics.
(async () => {
  const root = document.documentElement;
  const host = location.hostname.replace(/^www\./, "");
  const isTop = window === window.top;

  let s;
  try {
    s = Object.assign({}, TT_DEFAULTS, await chrome.storage.sync.get(null));
  } catch {
    s = Object.assign({}, TT_DEFAULTS);
  }
  if (TT_PAUSED_HOST(s.paused, host)) return;

  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(location.hostname);
  const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname);

  // Google: keep the normal results page (maps, weather, panels, images) and remove only
  // the AI Overview and the AI Mode entry points. Google's class names are scrambled and
  // change often, so the Overview is found by its heading text instead.
  if (s.google && isTop && isGoogle) {
    const AI_HEADING = /^(AI Overviews?|Übersicht mit KI|Aperçu (de l'|par )?IA|Vue d'ensemble (par l'|de l')?IA|Visión general (creada )?(por|con) IA|Resumo (criado )?por IA|Panoramica (creata con l')?IA|AI による概要)$/i;
    const STOP = new Set(["rso", "center_col", "rcnt", "search", "main"]);
    const tag = (el) => {
      el.setAttribute("data-tt-hidden", "");
      el.style.setProperty("display", "none", "important");
    };
    // Climb from the heading to the block that sits directly in the results column.
    const overviewBlock = (heading) => {
      let el = heading;
      while (el.parentElement && !STOP.has(el.parentElement.id) && el.parentElement !== document.body) {
        el = el.parentElement;
      }
      const results = document.getElementById("rso");
      if (!el.parentElement || el === document.body || (results && el.contains(results))) return null;
      return el;
    };
    const stripAI = () => {
      for (const h of document.querySelectorAll("h1, h2, h3, [role='heading'], strong, span, div[aria-level]")) {
        if (h.childElementCount > 2 || h.closest("[data-tt-hidden]")) continue;
        const text = (h.textContent || "").trim();
        if (text.length > 40 || !AI_HEADING.test(text)) continue;
        const block = overviewBlock(h);
        if (block) tag(block);
      }
      // AI Mode: the results tab, the button by the search box, and the homepage pill.
      for (const el of document.querySelectorAll("a[href*='udm=50'], [role='link'], [role='button'], button, a")) {
        if (el.closest("[data-tt-hidden]")) continue;
        const isAiMode = (el.getAttribute("href") || "").includes("udm=50") || (el.textContent || "").trim() === "AI Mode";
        if (isAiMode) tag(el.closest("[role='listitem']") || el);
      }
    };
    // Run on every change, without the usual debounce, so the box disappears as it arrives.
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; stripAI(); });
    }).observe(root, { childList: true, subtree: true });
    addEventListener("DOMContentLoaded", stripAI);
  }

  // Facebook: the home feed opens on the Friends feed. Other feeds (Feeds > All, Groups)
  // carry a filter in the URL, so they're left alone. Facebook changes pages without
  // reloading, so keep checking for a return to the bare home URL.
  const isFacebook = /^(www\.|web\.)?facebook\.com$/.test(location.hostname);
  if (s.facebook && isTop && isFacebook) {
    const toFriends = () => {
      if (location.pathname === "/" && !location.search) {
        location.replace("/?filter=friends&sk=h_chr");
        return true;
      }
      return false;
    };
    if (toFriends()) return;
    setInterval(toFriends, 500);
  }

  // ---------- CSS ----------
  const COOKIE_SEL = [
    "#onetrust-consent-sdk", "#onetrust-banner-sdk", "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyUnderlay", "#qc-cmp2-container", ".qc-cmp2-container",
    "#truste-consent-track", ".truste_box_overlay", ".truste_overlay", "#didomi-host",
    "#usercentrics-root", "#usercentrics-cmp-ui", "#cmpbox", "#cmpbox2", ".fc-consent-root",
    "[id^='sp_message_container']", ".cc-window", ".cc-banner", "#cookie-banner", ".cookie-banner",
    "#cookie-notice", "#cookie-law-info-bar", ".osano-cm-window", "#iubenda-cs-banner",
    "#termly-code-snippet-support", "#hs-eu-cookie-confirmation", ".cky-consent-container",
    ".cky-overlay", "#moove_gdpr_cookie_info_bar", "#cookiescript_injected", "#ccm-widget",
    "#axeptio_overlay", ".tarteaucitronAlertBig", "#gdpr-consent-tool-wrapper"
  ].join(",");

  const WIDGET_SEL = [
    "#intercom-container", ".intercom-lightweight-app", ".intercom-launcher",
    "#hubspot-messages-iframe-container", "#drift-widget-container", "#drift-frame-controller",
    "#drift-frame-chat", ".zEWidget-launcher", "iframe#launcher", "#crisp-chatbox", "#fc_frame",
    "#gorgias-chat-container", "#chat-widget-container", "#tidio-chat", "#podium-website-widget",
    ".smartbanner", "[id*='smartbanner' i]", "[class*='smart-banner' i]",
    "[class*='app-banner' i]", "[id*='app-banner' i]", "[class*='open-in-app' i]"
  ].join(",");

  const SHORTS_SEL = [
    "ytd-reel-shelf-renderer", "ytd-rich-shelf-renderer[is-shorts]",
    "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
    "ytd-guide-entry-renderer:has(a[title='Shorts'])",
    "ytd-mini-guide-entry-renderer[aria-label='Shorts']", "yt-tab-shape[tab-title='Shorts']",
    "ytd-video-renderer:has(a[href^='/shorts/'])", "ytd-rich-item-renderer:has(a[href^='/shorts/'])",
    "grid-shelf-view-model:has(ytm-shorts-lockup-view-model)", "ytm-shorts-lockup-view-model",
    "ytm-reel-shelf-renderer", "ytm-pivot-bar-item-renderer:has(.pivot-shorts)"
  ].join(",");

  let css = "[data-tt-hidden]{display:none!important}\n" +
    "html[data-tt-unlocked],html[data-tt-unlocked] body{overflow:auto!important}\n";
  if (s.widgets) css += WIDGET_SEL + "{display:none!important}\n";
  if (s.shorts && isYouTube) css += SHORTS_SEL + "{display:none!important}\n";
  if (s.google && isGoogle) css += "a[href*='udm=50']{display:none!important}\n";

  const style = document.createElement("style");
  style.id = "anditsgone";
  style.textContent = css;
  (document.head || root).appendChild(style);

  if (!isTop || !(s.popups || s.autoplay || s.sticky || s.cookies)) return;

  // ---------- Heuristics ----------
  const NAG = /subscribe|newsletter|sign ?up|create (a|an|your) (free )?account|log ?in to (continue|keep)|join (now|us|for free)|ad ?block|turn off your|disable your|whitelist|allowlist|notifications|download (the|our) app|open (in|the) app|get the app|before you go|don.t miss|% off|limited time|exclusive offer|continue reading|keep reading|register to/i;
  const VIDEO_SEL = "video, iframe[src*='youtube'], iframe[src*='jwplayer'], iframe[src*='vimeo'], iframe[src*='brightcove'], [class*='jw-'], [class*='video' i]";

  let lastGesture = 0;
  let lastNagHidden = 0;
  for (const t of ["pointerdown", "keydown", "touchstart"]) {
    addEventListener(t, (e) => { if (e.isTrusted) lastGesture = Date.now(); }, true);
  }
  // Leave dialogs the user opened alone.
  const gestureRecent = () => Date.now() - lastGesture < 2000;
  const userOpenedOverlays = new WeakSet();
  let visibleOverlays = new Set();

  const vw = () => innerWidth;
  const vh = () => innerHeight;
  const visibleArea = (r) =>
    Math.max(0, Math.min(r.right, vw()) - Math.max(r.left, 0)) *
    Math.max(0, Math.min(r.bottom, vh()) - Math.max(r.top, 0));

  function hide(el) {
    el.setAttribute("data-tt-hidden", "");
    el.style.setProperty("display", "none", "important");
  }

  // Outermost fixed (or sticky, if allowed) ancestor of an element.
  function pinnedAncestor(el, allowSticky) {
    let found = null;
    for (; el && el !== document.body && el !== root; el = el.parentElement) {
      const p = getComputedStyle(el).position;
      if (p === "fixed" || (allowSticky && p === "sticky")) found = el;
    }
    return found;
  }

  let unlockedBody = false;
  function unlockScroll() {
    root.setAttribute("data-tt-unlocked", "");
    const b = document.body;
    if (!unlockedBody && b && getComputedStyle(b).position === "fixed") {
      unlockedBody = true;
      const top = parseInt(b.style.top, 10) || 0;
      b.style.setProperty("position", "static", "important");
      b.style.removeProperty("top");
      if (top) scrollTo(0, -top);
    }
  }

  function isLocked() {
    return [root, document.body].some((el) => {
      const cs = getComputedStyle(el);
      return cs.overflow === "hidden" || cs.overflowY === "hidden" || (el === document.body && cs.position === "fixed");
    });
  }

  function scanOverlays() {
    const recent = gestureRecent();
    const current = new Set();
    const mainContent = document.querySelector("main, article, [role='main']");
    const seen = new Set();
    for (const el of document.elementsFromPoint(vw() / 2, vh() / 2)) {
      const f = pinnedAncestor(el, false);
      if (!f || seen.has(f) || f.hasAttribute("data-tt-hidden")) continue;
      seen.add(f);
      const cover = visibleArea(f.getBoundingClientRect()) / (vw() * vh());
      if (!cover) continue;
      current.add(f);
      if (recent && !visibleOverlays.has(f)) userOpenedOverlays.add(f);
      if (recent || userOpenedOverlays.has(f)) continue;
      const text = f.textContent || "";
      // Skip whole-app shells that happen to be position:fixed.
      if ((mainContent && f.contains(mainContent)) || f.querySelectorAll("a").length > 25 || text.length > 6000) continue;
      if (cover >= 0.15 && NAG.test(text.slice(0, 4000))) {
        hide(f);
        lastNagHidden = Date.now();
      } else if (cover >= 0.8 && text.trim().length < 40 && Date.now() - lastNagHidden < 3000) {
        hide(f); // the dimmed backdrop left behind
      }
    }
    for (const f of visibleOverlays) {
      if (!current.has(f)) userOpenedOverlays.delete(f);
    }
    visibleOverlays = current;
    if (Date.now() - lastNagHidden < 3000) unlockScroll();
  }

  function scanFloatingVideo() {
    if (isYouTube) return;
    const points = [[vw() - 40, vh() - 40], [40, vh() - 40], [vw() - 40, vh() * 0.6]];
    for (const [x, y] of points) {
      for (const el of document.elementsFromPoint(x, y)) {
        const f = pinnedAncestor(el, true);
        if (!f || f.hasAttribute("data-tt-hidden")) continue;
        const small = visibleArea(f.getBoundingClientRect()) / (vw() * vh()) < 0.5;
        if (small && (f.matches(VIDEO_SEL) || f.querySelector(VIDEO_SEL))) hide(f);
      }
    }
  }

  function scanSticky() {
    if (scrollY < 150) return;
    for (const el of document.elementsFromPoint(vw() / 2, 3)) {
      const f = pinnedAncestor(el, true);
      if (!f || f.dataset.ttUnstuck) continue;
      const r = f.getBoundingClientRect();
      if (r.top <= 2 && r.width >= vw() * 0.8 && r.height < vh() * 0.35) {
        const fixed = getComputedStyle(f).position === "fixed";
        f.dataset.ttUnstuck = "1";
        f.style.setProperty("position", fixed ? "absolute" : "relative", "important");
        if (fixed) f.style.setProperty("top", "0", "important");
      }
    }
  }

  function run() {
    if (!document.body) return;
    if (s.popups && !userOpenedConsent) scanOverlays();
    if (s.autoplay) scanFloatingVideo();
    if (s.sticky) scanSticky();
    // Consent tools often lock scrolling; we hid the banner, so give scrolling back.
    if (cookieFallback && isLocked() && document.querySelector(COOKIE_SEL)) unlockScroll();
  }

  // Fallback: if a known consent banner is still showing well after load, declining didn't work
  // on this site. Hide it so the page is usable, and report it as hidden, not declined:
  // hiding a banner records no choice, and the site may keep using cookies it already set.
  let cookieFallback = false;
  if (s.cookies) {
    const armFallback = () => setTimeout(() => {
      if (userOpenedConsent) return;
      const showing = [...document.querySelectorAll(COOKIE_SEL)].some((el) => el.getClientRects().length > 0);
      if (!showing) return;
      cookieFallback = true;
      style.textContent += COOKIE_SEL + "{display:none!important}\n";
      try { chrome.runtime.sendMessage({ type: "tt-banner-hidden" }); } catch {}
      schedule();
    }, 6000);
    document.readyState === "complete" ? armFallback() : addEventListener("load", armFallback, { once: true });
  }

  // When the person clicks a privacy or cookie settings link, they want the consent tool.
  // Lift every hide rule (ours and the consent engine's) and stop re-hiding on this page.
  const CONSENT_LINK = /cookie|privacy|consent|do not (sell|share)|your (privacy )?choices|opt[- ]?out|manage (preferences|settings|options)|ad choices/i;
  const CONSENT_HOOK = "a[href*='Cookiebot.renew'], .ot-sdk-show-settings, #ot-sdk-btn, [data-cc='show-preferencesModal'], .cky-btn-revisit, [onclick*='consent' i], [onclick*='cookie' i]";
  let userOpenedConsent = false;
  function releaseConsent() {
    userOpenedConsent = true;
    cookieFallback = false;
    for (const id of ["autoconsent-css-rules", "autoconsent-prehide"]) {
      for (const el of document.querySelectorAll("style#" + id)) el.remove();
    }
    style.textContent = style.textContent.split(COOKIE_SEL + "{display:none!important}\n").join("");
    for (const el of document.querySelectorAll("[data-tt-hidden]")) {
      if (el.matches(COOKIE_SEL) || /cookie|consent|privacy/i.test(el.id + " " + el.className)) {
        el.removeAttribute("data-tt-hidden");
        el.style.removeProperty("display");
      }
    }
  }
  addEventListener("click", (e) => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    const el = e.target.closest("a, button, [role='button'], [onclick]") || e.target;
    const label = (el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
    if (el.matches(CONSENT_HOOK) || CONSENT_LINK.test(label.slice(0, 200))) releaseConsent();
  }, true);

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; run(); }, 250);
  }

  new MutationObserver(schedule).observe(root, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open", "style"]
  });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("load", schedule);
  schedule();
})();

// Google changes its markup frequently. Only hide explicitly identified modules
// and exact AI-search navigation links; never infer a container from heading text.
globalThis.TT_START_GOOGLE_CLEANUP = () => {
  const GOOGLE_HOST = /^(www\.)?google\.(com|cat|[a-z]{2}|(co|com)\.[a-z]{2})$/i;
  if (!GOOGLE_HOST.test(location.hostname)) return;
  const root = document.documentElement;
  if (!root) {
    addEventListener("DOMContentLoaded", globalThis.TT_START_GOOGLE_CLEANUP, { once: true });
    return;
  }

  const MODULES = '[data-attrid="SGE"], [data-attrid="AIOverview"], [data-attrid="ai_overview"]';
  const LAYOUT = '#rso, #search, #center_col, #rcnt, #main, main, [role="main"]';
  const NAV_LINKS = '#hdtb a[href], nav a[href], [role="navigation"] a[href]';
  const MARK = "data-aig-google-hidden";
  const hidden = new Set();
  let style = null;

  const scan = () => {
    const targets = new Set();
    const searchPage = /^\/search\/?$/.test(location.pathname);
    const homePage = location.pathname === "/";
    const aiMode = new URL(location.href).searchParams.get("udm") === "50";
    if (searchPage && !aiMode) {
      for (const module of document.querySelectorAll(MODULES)) {
        // Fail open if a marked node contains the results layout or an ordinary
        // result heading. Google's organic results use h3 headings.
        if (!module.closest("#search, #rso") || module.matches(LAYOUT) ||
            module.querySelector(LAYOUT + ", h3")) continue;
        targets.add(module);
      }
    }
    if (!aiMode && (searchPage || homePage)) {
      for (const link of document.querySelectorAll(NAV_LINKS)) {
        if (link.closest("#rso")) continue;
        try {
          const url = new URL(link.getAttribute("href"), location.href);
          if (url.origin === location.origin && /^\/search\/?$/.test(url.pathname) &&
              url.searchParams.get("udm") === "50") targets.add(link);
        } catch {}
      }
    }

    // Google can reuse nodes during navigation. Remove our own marker when a
    // node no longer qualifies, without changing the site's inline styles.
    for (const el of hidden) {
      if (!targets.has(el) || !el.isConnected) {
        el.removeAttribute(MARK);
        hidden.delete(el);
      }
    }
    // Late layout removal while reading can move the viewport abruptly. Wait
    // for a fresh search/page load rather than hiding new blocks after scrolling.
    if (scrollY > 0) return;
    for (const el of targets) {
      if (hidden.has(el)) continue;
      if (!style) {
        style = document.createElement("style");
        style.textContent = `[${MARK}]{display:none!important}`;
        (document.head || root).appendChild(style);
      }
      el.setAttribute(MARK, "");
      hidden.add(el);
    }
  };

  let timer = null;
  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(() => { timer = null; scan(); }, 120);
  };
  new MutationObserver(schedule).observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["href", "data-attrid"]
  });
  addEventListener("DOMContentLoaded", schedule, { once: true });
  addEventListener("popstate", schedule);
  scan();
};

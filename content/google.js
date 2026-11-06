// Google changes its markup frequently. Hide explicitly identified modules, blocks
// that Google itself headed "AI Overview", exact AI-search navigation links, and
// the "AI Mode" button in Google's search box.
// A headed block fails open if it holds the results layout, a visible result
// heading (h3), or sits in the right-hand knowledge panel.
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
  // Google's own label for the overview. Only an ARIA heading counts, not h1-h6 text.
  const AI_HEADING = "AI Overview";
  const SIDE_PANEL = "#rhs";
  // Since late 2026 the overview is rendered inside an embedded AI Mode frame that
  // carries its own role="main" regions. Those belong to the overview, not to the
  // results layout, so they must not stop the overview from being hidden whole.
  const AI_FRAME = '#m-x-content, [data-subtree="mfc"]';
  // A "People also ask" question. Its expanded answer can be an AI Overview; only
  // that answer is hidden, never the question or the rest of the box.
  const QUESTION = "[data-q][data-lk]";
  const isLayout = (el) => !(el.matches('[role="main"]') && el.closest(AI_FRAME));
  const holdsLayout = (el) => [...el.querySelectorAll(LAYOUT + ", " + SIDE_PANEL)].some(isLayout);
  const hasVisibleResult = (el) =>
    [...el.querySelectorAll("h3")].some((h) => h.getBoundingClientRect().height > 0);

  // Outermost container around the heading that stays clear of the results layout
  // and, inside "People also ask", of the question's own expand toggle.
  const headedBlock = (label) => {
    if (!label.closest("#rcnt, #search") || label.closest(SIDE_PANEL)) return null;
    const question = label.closest(QUESTION);
    // The toggle is the last expand control before the answer's heading.
    const toggle = question && [...question.querySelectorAll("[aria-expanded]")]
      .filter((t) => t.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
    if (question && !toggle) return null;
    let block = null;
    for (let n = label.parentElement; n && !(n.matches(LAYOUT + ", " + SIDE_PANEL) && isLayout(n));
         n = n.parentElement) {
      if (n === question || (toggle && n.contains(toggle)) || holdsLayout(n)) break;
      block = n;
    }
    return block && !hasVisibleResult(block) ? block : null;
  };
  // Google's search box offers an "AI Mode" button that is not a udm=50 link.
  const SEARCH_FORM_BUTTONS = 'form[action="/search"] button, form[action="/search"] [role="button"], form[action="/search"] [role="link"]';
  const MARK = "data-aig-google-hidden";
  const hidden = new Set();
  let style = null;

  const scan = () => {
    const targets = new Set();
    // Answers opened inside "People also ask" while scrolled down. Hiding one that
    // starts at or below the top of the viewport only undoes the click's growth,
    // so nothing the reader is looking at moves.
    const answers = new Set();
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
      for (const label of document.querySelectorAll('[role="heading"]')) {
        if (label.textContent.trim() !== AI_HEADING) continue;
        const block = headedBlock(label);
        if (!block) continue;
        targets.add(block);
        if (block.closest(QUESTION)) answers.add(block);
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
      for (const button of document.querySelectorAll(SEARCH_FORM_BUTTONS)) {
        if (button.textContent.trim() === "AI Mode") targets.add(button);
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
    // for a fresh search/page load rather than hiding new blocks after scrolling,
    // except "People also ask" answers that start in or below the viewport.
    const scrolled = scrollY > 0;
    for (const el of targets) {
      if (hidden.has(el)) continue;
      if (scrolled && !(answers.has(el) && el.getBoundingClientRect().top >= 0)) continue;
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

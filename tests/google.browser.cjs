const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
let browser;

before(async () => {
  const candidates = ["/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const executablePath = process.env.CHROMIUM_PATH || candidates.find(p => fs.existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture(body, { url = "https://www.google.com/search?q=test", settings = {}, start = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<html><head></head><body>${body}</body></html>` }));
  await page.goto(url);
  await page.evaluate(settings => {
    window.chrome = { storage: { sync: { get: async () => ({
      cookies: false, popups: false, autoplay: false, sticky: false, widgets: false, ...settings
    }) } } };
  }, settings);
  for (const file of ["shared/defaults.js", "content/google.js"]) await page.addScriptTag({ path: path.join(root, file) });
  if (start) await page.addScriptTag({ path: path.join(root, "content/content.js") });
  return { page, errors, close: () => context.close() };
}

test("an ordinary AI Overview title cannot hide the results shell before #rso arrives", async () => {
  const h = await fixture('<section id="shell"><h2>AI Overview</h2><div id="normal" style="height:4000px"><h3>A regular search result</h3></div></section>', { start: false });
  try {
    await h.page.evaluate(() => window.scrollTo(0, 1200));
    await h.page.addScriptTag({ path: path.join(root, "content/content.js") });
    await h.page.evaluate(() => document.body.appendChild(document.createElement("span")));
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#shell").isVisible(), true);
    assert.equal(await h.page.evaluate(() => window.scrollY), 1200);
    await h.page.evaluate(() => document.querySelector("#shell").appendChild(Object.assign(document.createElement("div"), { id: "rso" })));
    await h.page.waitForTimeout(250);
    assert.equal(await h.page.locator("#shell").isVisible(), true);
    assert.equal(await h.page.locator("#normal").isVisible(), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test("identified AI modules hide, while normal results remain visible", async () => {
  const h = await fixture('<div id="search"><div data-attrid="SGE" id="ai"><h2>AI Overview</h2>AI text</div><div id="rso"><h3>Regular result</h3></div></div>');
  try {
    assert.equal(await h.page.locator("#ai").isVisible(), false);
    assert.equal(await h.page.locator("#rso").isVisible(), true);
  } finally { await h.close(); }
});

// Current (late 2026) Google markup: the overview sits beside #center_col with no
// data-attrid, headed by an ARIA heading, and holds a zero-size "AI Mode replied:" h3.
const OVERVIEW = '<div id="aio"><div><div role="heading" aria-level="2"><strong>AI Overview</strong></div><h3 style="height:0;margin:0;overflow:hidden">AI Mode replied:</h3><div>AI text</div></div></div>';

test("a block Google heads AI Overview hides, while results and the knowledge panel stay", async () => {
  const h = await fixture(`<div id="rcnt">${OVERVIEW}<div id="center_col" role="main"><div id="search"><div id="rso"><h3>Regular result</h3></div></div></div><div id="rhs"><div><div role="heading">AI Overview</div><a id="site" href="https://example.org">example.org</a></div></div></div>`);
  try {
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#aio").isVisible(), false);
    for (const id of ["rso", "rhs", "site"]) assert.equal(await h.page.locator("#" + id).isVisible(), true, id);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

// Google from November 2026: the overview is wrapped in an embedded AI Mode frame
// (#m-x-content inside [data-subtree="mfc"]) with its own zero-size role="main"
// regions, and a "Show more" button beside the frame. Hiding only the text inside
// the frame left a blank box with that button.
const FRAMED = (id) => `<div id="${id}"><div><div data-subtree="mfc"><div><div id="m-x-content"><section><div role="heading" aria-level="2">AI Overview</div><h3 style="height:0;margin:0;overflow:hidden">AI Mode reply for test</h3><div style="height:300px">AI text</div></section><section><div role="main" style="height:0;overflow:hidden"></div></section></div><div style="height:50px"><div role="button" aria-expanded="false">Show more</div></div></div></div></div></div>`;

test("an overview inside an AI Mode frame hides whole, beside or inside the results", async () => {
  for (const [where, body] of [
    ["beside #center_col", `<div id="rcnt">${FRAMED("aio")}<div id="center_col" role="main"><div id="search"><div id="rso"><h3>Regular result</h3></div></div></div></div>`],
    ["inside #rso", `<div id="rcnt"><div id="center_col" role="main"><div id="search"><div id="rso">${FRAMED("aio")}<div id="result"><h3>Regular result</h3></div></div></div></div></div>`]
  ]) {
    const h = await fixture(body);
    try {
      await h.page.waitForTimeout(200);
      assert.equal(await h.page.locator("#aio").isVisible(), false, where);
      assert.equal(await h.page.locator("#center_col").isVisible(), true, where);
      assert.equal(await h.page.getByText("Regular result").isVisible(), true, where);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  }
});

test("a visible role=main region outside an AI Mode frame still keeps a headed block visible", async () => {
  const h = await fixture('<div id="rcnt"><div id="mixed"><div role="heading">AI Overview</div><div role="main" id="real">Results</div></div><div id="center_col"></div></div>');
  try {
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#mixed").isVisible(), true);
    assert.equal(await h.page.locator("#real").isVisible(), true);
  } finally { await h.close(); }
});

// "People also ask": each question item carries data-q and data-lk, and a wrapper
// inside it holds both the expand toggle and the answer. An opened answer can be
// an AI Overview. Only that answer goes.
const QUESTION_ITEM = (n, answer) => `<div jsname="yEVEwb"><div data-q="Question ${n}?" data-lk="x"><div class="wrap"><div><div role="button" aria-expanded="${answer ? "true" : "false"}" id="q${n}">Question ${n}?</div></div><div><div id="a${n}">${answer || ""}</div></div></div></div></div>`;
const AI_ANSWER = '<div class="answer"><div><div role="heading" aria-level="3">AI Overview</div></div><div style="height:200px">AI answer</div></div>';

test("an AI Overview answer in People also ask hides, while the questions stay", async () => {
  const h = await fixture(`<div id="rcnt"><div id="center_col" role="main"><div id="search"><div id="rso"><div id="paa"><div role="heading">People also ask</div>${QUESTION_ITEM(1, AI_ANSWER)}${QUESTION_ITEM(2)}</div><div><h3>Regular result</h3></div></div></div></div></div>`);
  try {
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#a1 .answer").isVisible(), false);
    for (const id of ["paa", "q1", "q2"]) assert.equal(await h.page.locator("#" + id).isVisible(), true, id);
    assert.equal(await h.page.getByText("People also ask").isVisible(), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test("a People also ask answer with no toggle before it is left visible", async () => {
  const h = await fixture(`<div id="rcnt"><div id="center_col" role="main"><div id="search"><div id="rso"><div data-q="Question?" data-lk="x"><div id="answer">${AI_ANSWER}</div><div id="q" role="button" aria-expanded="true">Question?</div></div></div></div></div></div>`);
  try {
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#answer .answer").isVisible(), true);
    assert.equal(await h.page.locator("#q").isVisible(), true);
  } finally { await h.close(); }
});

test("a People also ask answer opened after scrolling hides without moving the page", async () => {
  const h = await fixture(`<div id="rcnt"><div id="center_col" role="main"><div id="search"><div id="rso"><div style="height:1500px">Earlier results</div><div id="paa">${QUESTION_ITEM(1)}${QUESTION_ITEM(2)}</div><div style="height:3000px">Later results</div></div></div></div></div>`, { start: false });
  try {
    await h.page.evaluate(() => window.scrollTo(0, 1200));
    await h.page.addScriptTag({ path: path.join(root, "content/content.js") });
    await h.page.waitForTimeout(200);
    await h.page.evaluate(answer => { document.querySelector("#a1").innerHTML = answer; }, AI_ANSWER);
    await h.page.waitForTimeout(300);
    assert.equal(await h.page.locator("#a1 .answer").isVisible(), false);
    assert.equal(await h.page.locator("#q1").isVisible(), true);
    assert.equal(await h.page.evaluate(() => window.scrollY), 1200);
    // An answer above the top of the viewport is left alone: removing it would
    // pull the text being read upward. (Chrome's scroll anchoring absorbs its growth.)
    await h.page.evaluate(() => window.scrollTo(0, 2200));
    await h.page.evaluate(answer => { document.querySelector("#a2").innerHTML = answer; }, AI_ANSWER);
    await h.page.waitForTimeout(300);
    assert.equal(await h.page.locator("#a2 .answer").isVisible(), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

test("the AI Mode button in Google's search box hides; other search box buttons stay", async () => {
  for (const url of ["https://www.google.com/", "https://www.google.com/search?q=test"]) {
    const h = await fixture('<form action="/search" role="search"><input name="q"><button id="voice" type="button" aria-label="Search by voice"></button><button id="ai" type="button" role="link"><div><span>AI Mode</span></div></button><button id="submit" type="submit">Google Search</button></form><div id="rso"><button id="outside">AI Mode</button></div>', { url });
    try {
      assert.equal(await h.page.locator("#ai").isVisible(), false, url);
      for (const id of ["voice", "submit", "outside"]) assert.equal(await h.page.locator("#" + id).isVisible(), true, id + " " + url);
    } finally { await h.close(); }
  }
});

test("an AI Overview heading next to a visible result heading is left visible", async () => {
  const h = await fixture('<div id="rcnt"><div id="mixed"><div role="heading">AI Overview</div><h3>Regular result</h3></div><div id="center_col"></div></div>');
  try {
    await h.page.waitForTimeout(200);
    assert.equal(await h.page.locator("#mixed").isVisible(), true);
  } finally { await h.close(); }
});

test("the older in-page Google One Tap iframe is hidden, and stays when switched off", async () => {
  const body = '<div id="credential_picker_container"><iframe id="frame"></iframe></div><p id="page">Article</p>';
  const on = await fixture(body, { url: "https://news.example/" });
  try {
    assert.equal(await on.page.locator("#credential_picker_container").isVisible(), false);
    assert.equal(await on.page.locator("#page").isVisible(), true);
  } finally { await on.close(); }
  const off = await fixture(body, { url: "https://news.example/", settings: { signin: false } });
  try { assert.equal(await off.page.locator("#credential_picker_container").isVisible(), true); }
  finally { await off.close(); }
});

test("a mislabeled container with ordinary results is left visible", async () => {
  const h = await fixture('<div id="search"><section data-attrid="SGE"><h2>AI Overview</h2><div id="rso"><h3>Regular result</h3></div></section><div data-attrid="AIOverview" id="mixed"><h3>Another regular result</h3></div></div>');
  try {
    assert.equal(await h.page.locator("#rso").isVisible(), true);
    assert.equal(await h.page.locator("#mixed").isVisible(), true);
  } finally { await h.close(); }
});

test("only exact AI navigation links hide; sibling tabs and result links remain", async () => {
  const h = await fixture('<nav><div role="listitem"><a id="ai" href="/search?udm=50&q=test">AI Mode</a><a id="all" href="/search?q=test">All</a></div><a id="other" href="/search?udm=500">AI Mode</a><a id="external" href="https://example.org/search?udm=50">External</a></nav><div id="rso"><a id="result" href="https://example.org/?udm=50">AI Mode</a><a id="query" href="/search?q=udm=50">Article about AI Mode</a></div>');
  try {
    assert.equal(await h.page.locator("#ai").isVisible(), false);
    for (const id of ["all", "other", "external", "result", "query"]) assert.equal(await h.page.locator("#" + id).isVisible(), true, id);
  } finally { await h.close(); }
});

test("Google apps, AI Mode itself, and unrelated hosts are untouched", async () => {
  for (const url of ["https://docs.google.com/search", "https://accounts.google.com/search", "https://www.google.com/maps", "https://www.google.com/aimode", "https://www.google.com/search?udm=50&q=test", "https://www.google.example.com/search"]) {
    const h = await fixture('<nav><a href="/search?udm=50">AI Mode</a></nav><div id="search"><div id="ai" data-attrid="SGE">Content</div></div>', { url });
    try { assert.equal(await h.page.locator("#ai").isVisible(), true, url); }
    finally { await h.close(); }
  }
});

test("the off switch and site pause both prevent Google cleanup", async () => {
  for (const settings of [{ google: false }, { paused: ["google.com"] }]) {
    const h = await fixture('<nav><a href="/search?udm=50">AI Mode</a></nav><div id="search"><div id="ai" data-attrid="SGE">Content</div></div>', { settings });
    try { assert.equal(await h.page.locator("#ai").isVisible(), true); }
    finally { await h.close(); }
  }
});

test("reused modules and links lose extension hiding when they become ordinary content", async () => {
  const h = await fixture('<nav><a id="tab" href="/search?udm=50">AI Mode</a></nav><div id="search"><div id="module" data-attrid="SGE" style="color:red">AI text</div></div>');
  try {
    assert.equal(await h.page.locator("#module").isVisible(), false);
    await h.page.evaluate(() => {
      document.querySelector("#module").removeAttribute("data-attrid");
      document.querySelector("#module").textContent = "Normal content";
      document.querySelector("#tab").setAttribute("href", "/search?q=ordinary");
    });
    await h.page.waitForTimeout(300);
    assert.equal(await h.page.locator("#module").isVisible(), true);
    assert.equal(await h.page.locator("#tab").isVisible(), true);
    assert.equal(await h.page.locator("#module").getAttribute("style"), "color:red");
  } finally { await h.close(); }
});

test("late AI insertion after scrolling cannot collapse the page or jump to its bottom", async () => {
  const h = await fixture('<div id="search"><div id="spacer" style="height:4000px">Normal search results</div></div>', { start: false });
  try {
    await h.page.evaluate(() => window.scrollTo(0, 1200));
    await h.page.addScriptTag({ path: path.join(root, "content/content.js") });
    await h.page.evaluate(() => {
      const ai = document.createElement("div");
      ai.id = "late-ai"; ai.dataset.attrid = "SGE";
      ai.innerHTML = '<h2>AI Overview</h2><div style="height:900px">Late AI text</div>';
      document.querySelector("#search").appendChild(ai);
    });
    await h.page.waitForTimeout(350);
    assert.equal(await h.page.evaluate(() => document.querySelector("#late-ai").hasAttribute("data-aig-google-hidden")), false);
    assert.equal(await h.page.evaluate(() => window.scrollY), 1200);
    assert.equal(await h.page.locator("#spacer").isVisible(), true);
    assert.deepEqual(h.errors, []);
  } finally { await h.close(); }
});

// Facebook: scripts run at the start of every document, as Chrome injects them.
// Init scripts can run before <html> exists, which Chrome's document_start never
// does, so page errors are not asserted here. Home is an in-page link, as on Facebook.
async function facebookTab(context) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return { page, errors };
}
async function facebookContext() {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<html><head></head><body><a id='home' href='/' onclick='event.preventDefault(); history.pushState({}, \"\", \"/\")'>Home</a></body></html>" }));
  await context.addInitScript(() => {
    window.chrome = { storage: { sync: { get: async () => ({ cookies: false, popups: false, autoplay: false, sticky: false, widgets: false }) } } };
  });
  for (const file of ["shared/defaults.js", "content/google.js", "content/content.js"]) {
    await context.addInitScript({ path: path.join(root, file) });
  }
  return context;
}
const onFriends = page => new URL(page.url()).searchParams.get("filter") === "friends";
const onHome = page => { const u = new URL(page.url()); return u.pathname === "/" && !u.search; };
// Facebook's own in-page navigation, without a click.
const appNavigate = (page, url) => page.evaluate(url => history.pushState({}, "", url), url);

test("Facebook lands on Friends once per tab, then Home stays reachable", async () => {
  const context = await facebookContext();
  try {
    const { page } = await facebookTab(context);
    await page.goto("https://www.facebook.com/");
    await page.waitForURL(/filter=friends/);
    await appNavigate(page, "/");
    await page.waitForTimeout(800);
    assert.equal(onHome(page), true, "in-page return to Home");
    await page.reload();
    await page.waitForTimeout(800);
    assert.equal(onHome(page), true, "reload on Home");
    const second = await facebookTab(context);
    await second.page.goto("https://www.facebook.com/");
    await second.page.waitForURL(/filter=friends/);
    assert.equal(onFriends(second.page), true, "a new tab lands on Friends");
  } finally { await context.close(); }
});

test("after a deep link, a clicked Home is respected but Facebook's own jump to Home lands on Friends", async () => {
  const context = await facebookContext();
  try {
    const clicked = await facebookTab(context);
    await clicked.page.goto("https://www.facebook.com/some.profile");
    await clicked.page.click("#home");
    await clicked.page.waitForTimeout(800);
    assert.equal(onHome(clicked.page), true, "clicked Home");

    const automatic = await facebookTab(context);
    await automatic.page.goto("https://www.facebook.com/some.profile");
    await appNavigate(automatic.page, "/");
    await automatic.page.waitForURL(/filter=friends/);
    assert.equal(onFriends(automatic.page), true, "unclicked jump to Home");
  } finally { await context.close(); }
});

test("with the Facebook switch off, Home is never redirected", async () => {
  const context = await browser.newContext();
  try {
    await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }));
    await context.addInitScript(() => { window.chrome = { storage: { sync: { get: async () => ({ facebook: false, cookies: false, popups: false, autoplay: false }) } } }; });
    for (const file of ["shared/defaults.js", "content/google.js", "content/content.js"]) await context.addInitScript({ path: path.join(root, file) });
    const page = await context.newPage();
    await page.goto("https://www.facebook.com/");
    await page.waitForTimeout(800);
    assert.equal(onHome(page), true);
  } finally { await context.close(); }
});

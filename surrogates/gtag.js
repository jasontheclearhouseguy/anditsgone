// Stand-in for Google's gtag.js. Sends nothing, but runs event_callback so pages that
// wait on analytics before navigating keep working.
(() => {
  const w = window;
  const dl = (w.dataLayer = w.dataLayer || []);
  const handle = (entry) => {
    // gtag() pushes its `arguments` object: ["event", name, { event_callback }]
    if (!entry || typeof entry !== "object" || typeof entry.length !== "number") return;
    const params = entry[2];
    if (entry[0] === "event" && params && typeof params.event_callback === "function") {
      try { params.event_callback(); } catch {}
    }
  };
  for (const entry of dl) handle(entry);
  const push = dl.push.bind(dl);
  dl.push = function () {
    for (const entry of arguments) handle(entry);
    return push.apply(null, arguments);
  };
})();

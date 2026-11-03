// Stand-in for Google Analytics (analytics.js). Sends nothing, but still runs callbacks
// so links and forms that wait on analytics keep working.
(() => {
  const w = window;
  const name = w.GoogleAnalyticsObject || "ga";
  const queued = w[name] && w[name].q;
  const noop = () => {};
  const tracker = { get: noop, set: noop, send: noop };
  const runCallback = (args) => {
    for (const a of args) {
      if (a && typeof a === "object" && typeof a.hitCallback === "function") {
        try { a.hitCallback(); } catch {}
      }
    }
  };
  function ga() {
    const args = Array.from(arguments);
    if (typeof args[0] === "function") { try { args[0](tracker); } catch {} return; }
    runCallback(args);
  }
  ga.create = () => tracker;
  ga.getByName = () => tracker;
  ga.getAll = () => [tracker];
  ga.remove = noop;
  ga.loaded = true;
  w[name] = ga;
  if (Array.isArray(queued)) for (const args of queued) ga.apply(null, Array.from(args));
})();

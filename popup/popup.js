(async () => {
  const s = Object.assign({}, TT_DEFAULTS, await chrome.storage.sync.get(null));
  const list = document.getElementById("list");
  const pause = document.getElementById("pause");
  const hostEl = document.getElementById("host");
  const siteState = document.getElementById("siteState");

  let tab = null;
  let host = "";
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const u = new URL(tab.url);
    if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, "");
  } catch {}

  // Reload the page after a change. Waits for the background to apply network rules first,
  // and collapses quick successive toggles into one reload.
  let reloadTimer = null;
  const changed = () => {
    if (!tab || !host) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try { await chrome.runtime.sendMessage({ type: "tt-apply" }); } catch {}
      try { await chrome.tabs.reload(tab.id); } catch {}
      document.getElementById("hint").textContent = "Reloaded with your changes.";
    }, 400);
  };

  // Cookie status for this tab. "Declined" means a Reject choice was actually recorded;
  // "hidden" means the banner was only hidden, which records no choice.
  try {
    const dk = "declined-" + tab.id, hk = "hidden-" + tab.id;
    const st = await chrome.storage.session.get([dk, hk]);
    const hint = document.getElementById("hint");
    if (st[dk]) hint.textContent = `Declined cookies on this page${st[dk] > 1 ? ` (${st[dk]} popups)` : ""}.`;
    else if (st[hk]) hint.textContent = "Hid the cookie banner, but couldn't decline on this site. It may still use cookies.";
  } catch {}

  for (const [key, name, desc] of TT_FEATURES) {
    const li = document.createElement("li");
    li.innerHTML = `<label><span class="name"></span><span class="desc"></span><input type="checkbox" id="f-${key}"></label>`;
    li.querySelector(".name").textContent = name;
    li.querySelector(".desc").textContent = desc;
    const box = li.querySelector("input");
    box.checked = !!s[key];
    box.addEventListener("change", async () => {
      await chrome.storage.sync.set({ [key]: box.checked });
      changed();
    });
    list.appendChild(li);
  }

  function renderSite() {
    const paused = (s.paused || []).includes(host);
    pause.checked = paused;
    document.getElementById("siteRow").classList.toggle("paused", paused);
    siteState.textContent = paused ? "Paused, showing the site as-is" : "Cleaned up";
  }

  if (host) {
    hostEl.firstChild.textContent = host;
    renderSite();
    pause.addEventListener("change", async () => {
      const set = new Set(s.paused || []);
      pause.checked ? set.add(host) : set.delete(host);
      s.paused = [...set];
      await chrome.storage.sync.set({ paused: s.paused });
      renderSite();
      changed();
    });
  } else {
    document.getElementById("siteRow").hidden = true;
  }
})();

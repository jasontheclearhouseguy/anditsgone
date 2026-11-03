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
      try {
        if (!await chrome.runtime.sendMessage({ type: "tt-apply" })) throw new Error("Could not apply settings");
      } catch {
        document.getElementById("hint").textContent = "Couldn't apply all settings. Reopen the popup and try again.";
        return;
      }
      try { await chrome.tabs.reload(tab.id); } catch {}
      document.getElementById("hint").textContent = "Reloaded with your changes.";
    }, 400);
  };

  // Show results only for the current document. A passed CMP check is distinct
  // from a cosmetic hide or an attempt whose result could not be checked.
  try {
    const key = "consent-" + tab.id;
    const st = (await chrome.storage.session.get(key))[key];
    const frame = await chrome.webNavigation.getFrame({ tabId: tab.id, frameId: 0 });
    const hint = document.getElementById("hint");
    if (st && frame && st.url === frame.url && st.documentId === frame.documentId) {
      if (st.declined) hint.textContent = `Cookie rejection passed the consent tool's check${st.declined > 1 ? ` (${st.declined} popups)` : ""}.`;
      else if (st.hidden) hint.textContent = "Hid the cookie banner, but couldn't confirm a rejection. This site may still use cookies.";
      else if (st.attempted) hint.textContent = "Tried to decline cookies, but couldn't verify the result. This site may still use cookies.";
    }
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
    const pausedHost = TT_PAUSED_HOST(s.paused, host);
    const paused = !!pausedHost;
    pause.checked = paused;
    document.getElementById("siteRow").classList.toggle("paused", paused);
    siteState.textContent = paused ? `Paused${pausedHost !== host ? " by " + pausedHost : " here"}; GPC can stay on` : "Cleaned up";
  }

  if (host) {
    hostEl.firstChild.textContent = host;
    renderSite();
    pause.addEventListener("change", async () => {
      const set = new Set(s.paused || []);
      if (pause.checked) set.add(host);
      else for (const p of set) if (TT_PAUSED_HOST([p], host)) set.delete(p);
      s.paused = [...set];
      await chrome.storage.sync.set({ paused: s.paused });
      renderSite();
      changed();
    });
  } else {
    document.getElementById("siteRow").hidden = true;
  }
})();

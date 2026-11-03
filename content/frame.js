// Child-frame hooks need the top-level site's pause state, which page-world
// scripts cannot read from extension storage. The worker checks it before injection.
if (window !== window.top) {
  chrome.runtime.sendMessage({ type: "tt-frame-init" }).catch(() => {});
}

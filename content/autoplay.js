// Main world, registered only while "No autoplay" is on and excluded on paused sites.
// Media plays only after the person interacts with the page.
(() => {
  let lastGesture = 0;
  for (const t of ["pointerdown", "keydown", "touchstart"]) {
    addEventListener(t, (e) => { if (e.isTrusted) lastGesture = Date.now(); }, true);
  }
  const userActive = () =>
    (navigator.userActivation && navigator.userActivation.isActive) || Date.now() - lastGesture < 5000;

  const allowed = new WeakSet();
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!allowed.has(this)) {
      if (!userActive()) {
        return Promise.reject(new DOMException("Autoplay blocked by AndItsGone", "NotAllowedError"));
      }
      allowed.add(this);
    }
    return origPlay.apply(this, arguments);
  };
  // Catches the autoplay attribute, which starts playback without calling play().
  document.addEventListener("play", (e) => {
    const m = e.target;
    if (!(m instanceof HTMLMediaElement) || allowed.has(m)) return;
    if (userActive()) { allowed.add(m); return; }
    m.pause();
  }, true);
})();

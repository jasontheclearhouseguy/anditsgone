// Main world, registered only while "No Google sign-in prompts" is on and excluded on paused sites.
// Chrome shows Google One Tap through the browser's FedCM API, outside the page, so CSS
// cannot hide it. Requests a site makes without a click are refused, as if dismissed.
// A click on a "Sign in with Google" button grants user activation and goes through.
// Like any main-world hook, this can be replaced by page code.
(() => {
  const proto = window.CredentialsContainer && CredentialsContainer.prototype;
  if (!proto || !proto.get) return;
  const GOOGLE = /^https:\/\/accounts\.google\.com\//;
  const origGet = proto.get;
  proto.get = function (options) {
    const identity = options && options.identity;
    const providers = identity && identity.providers;
    const google = Array.isArray(providers) &&
      providers.some((p) => p && GOOGLE.test(String(p.configURL || "")));
    const clicked = !!(navigator.userActivation && navigator.userActivation.isActive);
    const requested = identity && (identity.mode === "active" || identity.mode === "button");
    if (google && !clicked && !requested) {
      return Promise.reject(new DOMException("Google sign-in prompt blocked by AndItsGone", "NetworkError"));
    }
    return origGet.apply(this, arguments);
  };
})();

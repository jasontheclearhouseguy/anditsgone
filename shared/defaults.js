// Feature defaults, shared by the content script and the popup.
globalThis.TT_DEFAULTS = {
  google: true,        // Google without AI Overview or AI Mode
  reddit: true,        // www.reddit.com -> old.reddit.com
  facebook: true,      // Facebook home opens on the Friends feed
  cookies: true,       // click "Reject" on cookie / consent banners
  telemetry: true,     // block third-party analytics, session recording and tracking pixels
  gpc: true,           // send Global Privacy Control (Sec-GPC + navigator.globalPrivacyControl)
  popups: true,        // hide newsletter, signup and "before you go" overlays
  notifications: true, // auto-deny "Allow notifications?" prompts
  autoplay: true,      // media waits for page interaction; floating players removed
  widgets: true,       // chat bubbles and "open in app" banners
  shorts: true,        // YouTube Shorts shelves and tabs
  sticky: false,       // headers scroll away instead of following you
  paused: []           // hostnames where the extension does nothing
};

globalThis.TT_FEATURES = [
  ["google", "Google without AI", "Conservatively hides identified AI blocks and AI-search navigation links. Uncertain blocks stay visible."],
  ["reddit", "Old Reddit", "Sends reddit.com links to old.reddit.com."],
  ["facebook", "Facebook friends feed", "Facebook opens on posts from your friends, not suggested content."],
  ["cookies", "Decline cookies", "Clicks \"Reject all\" or \"Necessary only\" for you. Never clicks Accept."],
  ["gpc", "Global Privacy Control", "Tells every site not to sell or share your data. Legally binding in California and several other states."],
  ["telemetry", "Block telemetry", "Stops analytics, session recording and tracking pixels from reporting what you do."],
  ["popups", "No signup popups", "Newsletter, login and \"before you go\" overlays. Unlocks scrolling."],
  ["notifications", "No notification prompts", "Sites asking to send notifications get an automatic no."],
  ["autoplay", "No autoplay", "Blocks media until you interact with the page. Floating players removed."],
  ["widgets", "No chat bubbles or app banners", "Support chat launchers and \"Open in app\" bars."],
  ["shorts", "No YouTube Shorts", "Removes Shorts shelves, tabs and sidebar links."],
  ["sticky", "Unstick headers", "Top bars scroll away with the page. Can break some sites."]
];

globalThis.TT_PAUSED_HOST = (paused, host) => (paused || []).find((p) => host === p || host.endsWith("." + p));

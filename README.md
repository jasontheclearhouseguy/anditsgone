# AndItsGone

AI Overviews, cookie banners, signup popups, autoplay, trackers. Aaand it's gone.

A browser extension that strips the modern web back to the way you remember it.

## What it does

- **Plain Google results.** Every search opens in Google's Web mode (`udm=14`): no AI Overview, no carousels, no AI Mode tab.
- **Old Reddit.** reddit.com links go to old.reddit.com. Galleries, share links, settings and login are left alone.
- **Facebook friends feed.** Facebook's home page opens on the Friends feed: posts from people you know, no suggested pages, reels or ads. Feeds → All still shows the regular feed.
- **Decline cookies.** Finds cookie consent popups and clicks "Reject all" or "Necessary only" for you, using DuckDuckGo's open-source autoconsent rules (hundreds of consent tools, plus a fallback that recognizes reject and dismiss buttons). It never clicks Accept. If it can't decline on a site, it hides the banner after a few seconds so the page is usable, and the popup says so. Hiding records no choice, so that site may still use cookies.
- **Global Privacy Control.** Sends the `Sec-GPC: 1` header with every request and sets `navigator.globalPrivacyControl`. Under the CCPA regulations, California businesses must treat this as an opt-out of selling or sharing your personal information, and Colorado, Connecticut, New Jersey, Oregon, Texas and other states have similar rules. GPC stays on even on paused sites, since it can't break a page.
- **Block telemetry.** Stops third-party analytics (Google Analytics, Mixpanel, Segment, Amplitude, Heap), session recording (Hotjar, FullStory, Microsoft Clarity, LogRocket and others), tracking pixels (Meta, LinkedIn, TikTok, X, Pinterest, Bing, Snap) and background beacons. Google Analytics is replaced with a stand-in that sends nothing but keeps pages that wait on it working.
- **No signup popups.** Catches page-covering overlays that appear on their own and talk about newsletters, accounts, ad blockers, apps or discounts. Dialogs you open yourself are left alone.
- **No notification prompts.** Sites asking to send notifications get an automatic no.
- **No autoplay.** Video and audio wait until you press play. Floating corner players are removed.
- **No chat bubbles or app banners.** Intercom, Drift, HubSpot, Zendesk and similar launchers, plus "Open in app" bars.
- **No YouTube Shorts.** Shelves, tabs and sidebar links.
- **Unstick headers** (off by default). Top bars scroll away with the page.

Each feature has a switch in the toolbar popup, and **Pause here** turns everything off for the current site.

## Install

### Chrome, Edge, Brave, Arc (desktop)
1. Unzip this folder somewhere permanent (Chrome loads it from that spot).
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `anditsgone` folder.
4. Pin it from the puzzle-piece menu so the popup is one click away.

### Firefox (desktop)
For a quick test: `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`. It is removed when Firefox restarts.
To keep it: zip the folder contents and submit it to addons.mozilla.org as **unlisted** (self-distribution). Mozilla signs it for free, usually within minutes, and you install the signed file.

### Phones
- **Android:** Firefox for Android runs signed extensions, so the AMO route above works there too.
- **iPhone:** Safari only runs extensions shipped inside an App Store app. The Orion browser can load Firefox extensions and is the closest option.

## Pair it with
uBlock Origin (or uBlock Origin Lite in Chrome) for ads and trackers. This extension deliberately doesn't try to replace it.

## Browser telemetry
The extension blocks what *websites* send. Your browser's own reporting to Google, Microsoft or Mozilla can't be seen by an extension, so switch it off in settings:
- **Chrome:** Settings → You and Google → Sync and Google services → turn off "Help improve Chrome's features and performance" and "Make searches and browsing better."
- **Edge:** Settings → Privacy, search, and services → turn off "Optional diagnostic data."
- **Firefox:** Settings → Privacy & Security → Firefox Data Collection and Use → uncheck everything.

## Building
The cookie-decline engine is bundled from npm. After changing anything in `src/`:
```
npm install
npm run build
```
The `build/` folder is committed, so loading the extension unpacked works without building.

## Credits
Cookie handling uses [@duckduckgo/autoconsent](https://github.com/duckduckgo/autoconsent) (MPL-2.0).

## Notes
- Requires Chrome 111+ or Firefox 128+.
- Nothing leaves your browser. Settings sync through your browser account's extension storage.
- If a site breaks, use **Pause here** on it.

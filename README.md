# AndItsGone

AI Overviews, cookie banners, signup popups, autoplay, trackers. Aaand it's gone.

A browser extension that strips the modern web back to the way you remember it.

## What it does

- **Google without AI.** Conservatively hides explicitly marked AI Overview modules and exact AI-search links in Google's navigation. It leaves uncertain blocks visible, preserves ordinary results and links, and does not hide new blocks after you scroll down. Google changes its markup often, so some AI content and entry points may remain. You can turn this feature off in the popup.
- **Old Reddit.** reddit.com links go to old.reddit.com. Galleries, share links, settings and login are left alone.
- **Facebook friends feed.** Facebook's home page opens on the Friends feed: posts from people you know, no suggested pages, reels or ads. Feeds → All still shows the regular feed.
- **Decline cookies.** Finds cookie consent popups and clicks "Reject all" or "Necessary only" for you, using DuckDuckGo's open-source autoconsent rules (hundreds of consent tools, plus a fallback restricted to explicit rejection buttons). The generic fallback leaves ambiguous "OK" and "Continue" buttons alone. The popup distinguishes a rejection that passed the consent tool's check from an unverified attempt or a hidden banner. Hiding records no choice, so that site may still use cookies.
- **Global Privacy Control.** Sends the `Sec-GPC: 1` header with every request and sets `navigator.globalPrivacyControl`. Under the CCPA regulations, California businesses must treat this as an opt-out of selling or sharing your personal information, and Colorado, Connecticut, New Jersey, Oregon, Texas and other states have similar rules. GPC stays on even on paused sites, since it can't break a page.
- **Block telemetry.** Stops third-party analytics (Google Analytics, Mixpanel, Segment, Amplitude, Heap), session recording (Hotjar, FullStory, Microsoft Clarity, LogRocket and others), tracking pixels (Meta, LinkedIn, TikTok, X, Pinterest, Bing, Snap) and background beacons. Google Analytics is replaced with a stand-in that sends nothing but keeps pages that wait on it working.
- **No signup popups.** Catches page-covering overlays that appear on their own and talk about newsletters, accounts, ad blockers, apps or discounts. Dialogs you open yourself are left alone.
- **No notification prompts.** Sites asking to send notifications get an automatic no.
- **No autoplay.** Video and audio are blocked until you interact with the page. An unrelated click, touch or key press can allow playback for five seconds, and media allowed during that window can play again on that page. Floating corner players are removed. This is a page cleanup feature; page code can replace the playback and notification hooks.
- **No chat bubbles or app banners.** Intercom, Drift, HubSpot, Zendesk and similar launchers, plus "Open in app" bars.
- **No YouTube Shorts.** Shelves, tabs and sidebar links.
- **Unstick headers** (off by default). Top bars scroll away with the page.

Each feature has a switch in the toolbar popup. **Pause here** pauses cleanup on the current site, its subdomains and embedded frames; Global Privacy Control stays enabled when its switch is on. The popup shows when a pause comes from a parent domain; resuming removes that parent-domain pause too.

Child-frame notification and autoplay hooks are installed after the worker checks the top-level site's settings, so scripts that run earlier in those frames may escape interception.

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

Run `npm test` after rebuilding to check consent status, navigation resets, pause rules, and settings handling. These tests use browser API mocks; they do not replace loading the extension in Chrome and Firefox for integration testing.

Run `npm run test:browser` for Google cleanup regression fixtures in headless Chromium. The tests use `/usr/bin/chromium` when available; otherwise run `npx playwright install chromium` first or set `CHROMIUM_PATH` to your Chromium executable. The fixtures check that normal results, navigation controls and scroll position survive cleanup; they do not test live Google markup.

## Credits
Cookie handling uses [@duckduckgo/autoconsent](https://github.com/duckduckgo/autoconsent) (MPL-2.0).

## Notes
- Requires Chrome 111+ or Firefox 128+.
- The extension has no analytics or author-operated data collection endpoint. Settings, including paused hostnames, sync through your browser account's extension storage.
- The navigation permission resets consent status between pages and checks whether embedded frames belong to a paused site. It is not used to keep browsing history.
- If a site breaks, use **Pause here** on it.

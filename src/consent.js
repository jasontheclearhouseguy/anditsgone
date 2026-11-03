// Content script (every frame): finds cookie popups and clicks Reject / Necessary only.
import AutoConsent from "@duckduckgo/autoconsent";

const consent = new AutoConsent((message) => {
  chrome.runtime.sendMessage(message).catch(() => {});
  // A successful rule can just hide a banner. Only label a rejection as checked
  // after a non-cosmetic rule's own verification succeeds.
  if (message.type === "autoconsentDone") {
    const report = (status) => chrome.runtime.sendMessage({
      type: "tt-consent-status", status, url: location.href
    }).catch(() => {});
    if (message.isCosmetic) report("hidden");
    else if (consent.foundCmp?.hasSelfTest) {
      consent.doSelfTest().then((ok) => report(ok ? "declined" : "attempted"), () => report("attempted"));
    } else report("attempted");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  consent.receiveMessageCallback(message);
});

// Content script (every frame): finds cookie popups and clicks Reject / Necessary only.
import AutoConsent from "@duckduckgo/autoconsent";

const consent = new AutoConsent((message) => {
  chrome.runtime.sendMessage(message).catch(() => {});
});

chrome.runtime.onMessage.addListener((message) => {
  consent.receiveMessageCallback(message);
});

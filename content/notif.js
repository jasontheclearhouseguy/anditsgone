// Main world, registered only while "No notification prompts" is on and excluded on paused sites.
// No on/off state lives in the page, so the page can't switch this off.
(() => {
  if (window.Notification && Notification.requestPermission) {
    Notification.requestPermission = function (cb) {
      if (typeof cb === "function") cb("denied");
      return Promise.resolve("denied");
    };
  }
  if (window.PushManager && PushManager.prototype.subscribe) {
    PushManager.prototype.subscribe = function () {
      return Promise.reject(new DOMException("Blocked by AndItsGone", "NotAllowedError"));
    };
  }
})();

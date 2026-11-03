// Main world, registered only while "No notification prompts" is on and excluded on paused sites.
// Like any main-world hook, this can be replaced by page code.
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

// Global Privacy Control JS signal (https://globalprivacycontrol.org). Registered only while GPC is on.
try {
  Object.defineProperty(Navigator.prototype, "globalPrivacyControl", {
    get: () => true,
    configurable: true,
    enumerable: true
  });
} catch {}

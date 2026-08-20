(function () {
  "use strict";

  if (window.__OSL_REWARD_LOADER__) return;
  window.__OSL_REWARD_LOADER__ = true;

  var pending = [];
  var modulePromise = null;
  var moduleUrl = "/js/reward-chest.js?v=22";

  function load() {
    if (!modulePromise) {
      modulePromise = import(moduleUrl).catch(function (error) {
        modulePromise = null;
        console.warn("[reward-loader] Não foi possível carregar o baú:", error);
        throw error;
      });
    }
    return modulePromise;
  }

  function enqueue(detail) {
    if (!detail) return;
    pending.push(detail);
    load().then(function () {
      var api = window.OSLRewardChest;
      var items = pending.splice(0);
      if (api && typeof api.show === "function") items.forEach(api.show);
    }).catch(function () {});
  }

  window.__oslRewardQueue = { push: enqueue };
  window.addEventListener("osl:reward", function (event) {
    if (window.OSLRewardChest) return;
    enqueue(event.detail);
  });

  function warmInBackground() { load().catch(function () {}); }
  window.addEventListener("load", function () {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(warmInBackground, { timeout: 6000 });
    } else {
      setTimeout(warmInBackground, 3500);
    }
  }, { once: true });
})();

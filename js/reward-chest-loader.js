(function () {
  "use strict";

  if (window.__OSL_REWARD_LOADER__) return;
  window.__OSL_REWARD_LOADER__ = true;

  var pending = [];
  var modulePromise = null;
  var moduleUrl = "/js/reward-chest.js?v=23";

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

  function flushPending() {
    return load().then(function () {
      var api = window.OSLRewardChest;
      var items = pending.splice(0);
      if (api && typeof api.show === "function") items.forEach(api.show);
    });
  }

  function enqueue(detail) {
    if (!detail) return;
    pending.push(detail);
    flushPending().catch(function () {});
  }

  window.__oslRewardQueue = { push: enqueue };
  window.addEventListener("osl:reward", function (event) {
    if (window.OSLRewardChest) return;
    enqueue(event.detail);
  });
  // Se o primeiro carregamento falhou durante a sessão, a saída da Arena é o
  // momento seguro para tentar novamente sem interromper a partida.
  window.addEventListener("osl:arena-exited", function () {
    if (!pending.length || window.OSLRewardChest) return;
    flushPending().catch(function () {});
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

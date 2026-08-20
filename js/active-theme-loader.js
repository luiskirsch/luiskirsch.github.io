(function () {
  "use strict";

  function subscribeToThemeUpdates() {
    var moduleUrl = location.pathname.indexOf("/staging/") === 0
      ? "/staging/js/active-theme.js?v=2"
      : "/js/active-theme.js?v=2";
    import(moduleUrl).catch(function (error) {
      console.warn("[theme] Atualização remota indisponível; mantendo tema em cache.", error);
    });
  }

  window.addEventListener("load", function () {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(subscribeToThemeUpdates, { timeout: 5000 });
    } else {
      setTimeout(subscribeToThemeUpdates, 2500);
    }
  }, { once: true });
})();

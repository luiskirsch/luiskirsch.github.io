(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  var warmed = new Set();

  function warmNavigation(event) {
    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download")) return;

    var url;
    try { url = new URL(link.href, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.href === location.href) return;
    if (!(/\.html$/i.test(url.pathname) || url.pathname.endsWith("/"))) return;
    if (warmed.has(url.href)) return;

    warmed.add(url.href);
    fetch(url.href, { credentials: "same-origin", cache: "force-cache" }).catch(function () {});
  }

  document.addEventListener("pointerover", warmNavigation, { passive: true });
  document.addEventListener("focusin", warmNavigation);
  document.addEventListener("touchstart", warmNavigation, { passive: true });

  function registerWorker() {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(function (registration) {
        if ("requestIdleCallback" in window) {
          requestIdleCallback(function () { registration.update().catch(function () {}); });
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "complete") registerWorker();
  else window.addEventListener("load", registerWorker, { once: true });
})();

if ("serviceWorker" in navigator) {
  const reloadKey = "osl_sw_controller_reload_v10";
  let alreadyReloaded = false;
  try {
    alreadyReloaded = sessionStorage.getItem(reloadKey) === "1";
    sessionStorage.removeItem(reloadKey);
  } catch (_) {}
  let controllerHandled = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controllerHandled || alreadyReloaded) return;
    controllerHandled = true;
    try { sessionStorage.setItem(reloadKey, "1"); } catch (_) {}
    window.location.reload();
  });

  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(() => {});
}

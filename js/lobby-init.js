(function() {
  // Refresh btn — gira seta ao clicar
  document.getElementById("multiRefreshBtn")?.addEventListener("click", async function() {
    var btn = this;
    btn.classList.add("spinning");
    setTimeout(function() { btn.classList.remove("spinning"); }, 650);
    var rooms = await (window._osl?.fetchLiveRooms?.() || Promise.resolve([]));
    window._osl?.renderLiveRooms?.(rooms);
  });

  // Painel espectador — fechar (+ desconectar LiveKit subscriber)
  function closeSpecOverlay() {
    var overlay = document.getElementById("specOverlay");
    if (!overlay) return;
    window._osl?.closeSpectatorRoom?.();
    overlay.classList.add("closing");
    setTimeout(function() {
      overlay.classList.remove("closing");
      overlay.style.display = "none";
    }, 220);
  }

  document.getElementById("specClose")?.addEventListener("click", closeSpecOverlay);
  document.getElementById("specOverlay")?.addEventListener("click", function(e) {
    if (e.target === this) closeSpecOverlay();
  });
  document.addEventListener("keydown", function(e) {
    var o = document.getElementById("specOverlay");
    if (e.key === "Escape" && o && o.style.display !== "none") closeSpecOverlay();
  });

  // Event delegation em #multiBody — capta cliques no botão 👁 mesmo após re-renders
  document.getElementById("multiBody")?.addEventListener("click", function(e) {
    var btn = e.target.closest(".multiSpectateBtn");
    if (!btn) return;
    e.stopPropagation();
    var row = btn.closest(".multiRoom");
    if (!row) return;
    window._osl?.spectateRoom?.(row.dataset.code, row.dataset.name);
  });
})();

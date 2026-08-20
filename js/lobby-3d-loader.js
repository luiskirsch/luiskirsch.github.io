(function () {
  "use strict";

  if (!document.getElementById("lobbyCanvas")) return;

  function loadLobbyEffects() {
    import("/js/lobby-3d.js?v=4").catch(function (error) {
      console.warn("[lobby] Efeitos físicos indisponíveis; mantendo a imagem estática.", error);
    });
  }

  // O módulo não depende mais do Three.js; entra já no quadro seguinte.
  requestAnimationFrame(loadLobbyEffects);
})();

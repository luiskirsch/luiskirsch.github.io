(function(){
  function _markReady() { document.body.classList.add('lobby-video-ready'); }

  var img = document.getElementById('lobbyBgImg');
  if (img) {
    if (img.complete) { _markReady(); }
    else {
      img.addEventListener('load', _markReady, { once: true });
      img.addEventListener('error', _markReady, { once: true });
      setTimeout(_markReady, 2000); // fallback
    }
  } else {
    _markReady();
  }

  // Botão de áudio ambiente (já não há video, então esconde o botão)
  var lobbyBtn = document.getElementById('toggleLobbyAudioBtn');
  if (lobbyBtn) lobbyBtn.style.display = 'none';
})();

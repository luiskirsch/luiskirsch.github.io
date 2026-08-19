(function(){
  var vA = document.getElementById('lobbyVideoA');
  var vB = document.getElementById('lobbyVideoB');
  if (!vA || !vB) return;

  var FADE = 0.6;      // segundos de crossfade
  var OVERLAP = 0.8;   // segundos antes do fim para iniciar o próximo
  var active = vA, next = vB;
  var switching = false;
  var unlocked = false;

  function setOpacity(el, val) {
    el.style.transition = 'opacity '+FADE+'s linear';
    el.style.opacity = val;
  }

  function doSwap() {
    if (switching) return;
    switching = true;
    next.currentTime = 0;
    next.muted = active.muted;
    next.play().catch(function(){});
    setOpacity(next, '1');
    setOpacity(active, '0');
    var prev = active;
    active = next;
    next = prev;
    setTimeout(function(){
      next.pause();
      next.currentTime = 0;
      switching = false;
    }, FADE * 1000 + 100);
  }

  function watchLoop() {
    if (!active.duration || switching) return;
    if (active.currentTime >= active.duration - OVERLAP) doSwap();
  }

  vA.addEventListener('timeupdate', watchLoop);
  vB.addEventListener('timeupdate', watchLoop);

  // Marca body como pronto quando o vídeo puder ser reproduzido
  function _markReady() { document.body.classList.add('lobby-video-ready'); }
  vA.addEventListener('canplay', _markReady, { once: true });
  vA.addEventListener('timeupdate', _markReady, { once: true });
  // Fallback: exibe o centro mesmo se o vídeo não iniciar em 2s
  setTimeout(_markReady, 2000);

  function updateLobbyMuteBtn() {
    var btn = document.getElementById('toggleLobbyAudioBtn');
    if (!btn) return;
    btn.textContent = active.muted ? '🔇 Ambiente' : '🔊 Ambiente';
    btn.title = active.muted ? 'Ativar som ambiente' : 'Silenciar som ambiente';
  }

  window._toggleLobbyMute = function() {
    if (!unlocked) {
      // Primeiro clique: desbloqueia e liga o som. Feito de forma síncrona no
      // handler de click para evitar race com microtasks de outros listeners.
      unlocked = true;
      active.muted = false;
      next.muted   = false;
      active.play().catch(function(){});
      updateLobbyMuteBtn();
      return;
    }
    var m = !active.muted;
    active.muted = m;
    next.muted   = m;
    updateLobbyMuteBtn();
  };

  // Registra listener via JS (inline onclick bloqueado por CSP)
  var lobbyBtn = document.getElementById('toggleLobbyAudioBtn');
  if (lobbyBtn) lobbyBtn.addEventListener('click', function() { window._toggleLobbyMute(); });

  // Sincroniza ícone com estado real (vídeo começa muted pelo atributo HTML)
  updateLobbyMuteBtn();
})();

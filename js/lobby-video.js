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

  function updateLobbyMuteBtn() {
    var btn = document.getElementById('toggleLobbyAudioBtn');
    if (!btn) return;
    btn.textContent = active.muted ? '🔇 Ambiente' : '🔊 Ambiente';
    btn.title = active.muted ? 'Ativar som ambiente' : 'Silenciar som ambiente';
  }

  // Desbloqueia som no primeiro gesto.
  // Usa microtask para que um onclick simultâneo (fase bubble) já encontre unlocked=true
  // e execute o toggle real em vez de brigar com unlock().
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Promise.resolve().then(function() {
      active.muted = false;
      next.muted   = false;
      active.play();
      updateLobbyMuteBtn();
    });
  }
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('touchstart',  unlock, { once: true, capture: true });
  document.addEventListener('keydown',     unlock, { once: true, capture: true });

  window._toggleLobbyMute = function() {
    if (!unlocked) {
      // Primeiro toque direto no botão Ambiente — desbloqueia sem re-mutar
      unlock();
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

(function(){
  var AUDIO_VOL = 0.12;
  var audioMuted = false;

  function _markReady(){ document.body.classList.add('lobby-video-ready'); }

  var image = document.getElementById('lobbyBgImg');
  if(image){
    if(image.complete) _markReady();
    else {
      image.addEventListener('load', _markReady, { once:true });
      image.addEventListener('error', _markReady, { once:true });
    }
    setTimeout(_markReady, 2200);
  } else {
    _markReady();
  }

  var aud = document.getElementById('lobbyAmbientAudio');
  if(aud){
    aud.volume = AUDIO_VOL;

    function startAudio(){
      if(aud && !audioMuted) aud.play().catch(function(){});
    }
    // tenta imediatamente; retenta no primeiro gesto caso autoplay bloqueado
    startAudio();
    document.addEventListener('click',      startAudio, { once:true });
    document.addEventListener('touchstart', startAudio, { once:true });
  }

  var btn = document.getElementById('toggleLobbyAudioBtn');
  if(btn){
    btn.style.display = '';
    btn.textContent = '🔊 Ambiente';
    btn.addEventListener('click', function(){
      if(!aud) return;
      audioMuted = !audioMuted;
      if(audioMuted){
        aud.pause();
        btn.textContent = '🔇 Ambiente';
      } else {
        aud.play().catch(function(){});
        btn.textContent = '🔊 Ambiente';
      }
    });
  }

  // para tudo quando ritual começar
  var obs = new MutationObserver(function(){
    if(document.body.classList.contains('ritual-started')){
      if(aud) aud.pause();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { attributes:true, attributeFilter:['class'] });
})();

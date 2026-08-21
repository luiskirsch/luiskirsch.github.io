(function(){
  var AUDIO_VOL = 0.12;
  var audioMuted = false;
  var video = document.getElementById('lobbyBgVideo');
  var audio = document.getElementById('lobbyAmbientAudio');

  function markReady(){ document.body.classList.add('lobby-video-ready'); }
  function startVideo(){
    if(video && !document.body.classList.contains('ritual-started')) video.play().catch(function(){});
  }

  if(video){
    if(video.readyState >= 2) markReady();
    else {
      video.addEventListener('loadeddata', markReady, { once:true });
      video.addEventListener('canplay', markReady, { once:true });
      video.addEventListener('error', markReady, { once:true });
    }
    startVideo();
    setTimeout(markReady, 2400);
    document.addEventListener('click', startVideo, { once:true });
    document.addEventListener('touchstart', startVideo, { once:true });
  } else {
    markReady();
  }

  if(audio){
    audio.volume = AUDIO_VOL;

    function startAudio(){
      if(audio && !audioMuted) audio.play().catch(function(){});
    }
    startAudio();
    document.addEventListener('click', startAudio, { once:true });
    document.addEventListener('touchstart', startAudio, { once:true });
  }

  var button = document.getElementById('toggleLobbyAudioBtn');
  if(button){
    button.style.display = '';
    button.textContent = '🔊 Ambiente';
    button.addEventListener('click', function(){
      if(!audio) return;
      audioMuted = !audioMuted;
      if(audioMuted){
        audio.pause();
        button.textContent = '🔇 Ambiente';
      } else {
        audio.play().catch(function(){});
        button.textContent = '🔊 Ambiente';
      }
    });
  }

  var observer = new MutationObserver(function(){
    if(document.body.classList.contains('ritual-started')){
      if(video) video.pause();
      if(audio) audio.pause();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { attributes:true, attributeFilter:['class'] });
})();

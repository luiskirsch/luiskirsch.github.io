/* Lobby: cabana em 3D (Godot / WebGL 2) no lugar do vídeo de fundo.
 *
 * A cena é publicada no Cloudflare R2 (projeto sextolugar-godot, ferramentas/publicar_web.py) e
 * entra num iframe de outro site (r2.dev): o Chrome roda a cena num processo próprio, então a
 * compilação de shaders da primeira visita não trava a interface do lobby.
 *
 * O vídeo/pôster continua por baixo até a cena avisar que está pronta (postMessage
 * {cabana:'pronta'}); aí o iframe aparece em fade e o vídeo pausa. Só em computador com WebGL 2 —
 * celular, economia de dados ou pouca memória seguem com o vídeo. ?cena3d=0 desliga (teste).
 * Quando o ritual começa, o iframe sai e libera a GPU para o jogo e as câmeras.
 */
(function () {
  'use strict';
  var ORIGEM = 'https://pub-78ce47404499423abafb9047e4a44920.r2.dev';
  var URL_CENA = ORIGEM + '/staging/atual.html';

  var viewer = document.getElementById('lobbyViewer');
  var picture = viewer && viewer.querySelector('.lobbyViewer__picture');
  var video = document.getElementById('lobbyBgVideo');
  var audio = document.getElementById('lobbyAmbientAudio');
  var botaoAudio = document.getElementById('toggleLobbyAudioBtn');
  if (!picture) return;

  function podeUsar3D() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('cena3d') === '0') return false;
      if (q.get('cena3d') === '1') return true;
      if (navigator.connection && navigator.connection.saveData) return false;
      if (!matchMedia('(pointer: fine)').matches) return false;          // celular/tablet: vídeo
      if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
      var gl = document.createElement('canvas').getContext('webgl2');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  if (document.body.classList.contains('ritual-started') || !podeUsar3D()) return;

  var frame = document.createElement('iframe');
  var pronta = false;
  frame.className = 'lobbyViewer__cena';
  frame.title = 'Cabana do SEXTOLUGAR em 3D — clique para andar';
  frame.allow = 'autoplay; fullscreen';
  frame.src = URL_CENA;
  picture.appendChild(frame);

  function mudo() {
    return !!(botaoAudio && botaoAudio.textContent.indexOf('🔇') !== -1);
  }
  function avisarCena(tipo, valor) {
    if (frame.contentWindow) frame.contentWindow.postMessage({ cabana: tipo, valor: valor }, ORIGEM);
  }

  function revelar() {
    if (pronta) return;
    pronta = true;
    document.body.classList.add('lobby-cena3d-pronta');
    avisarCena('mudo', mudo());
    // a cena tem o próprio som (noite, rádio): o ambiente do lobby sai para não sobrepor
    if (audio) audio.pause();
    setTimeout(function () { if (video) video.pause(); }, 1800);
  }

  function remover() {
    document.body.classList.remove('lobby-cena3d-pronta');
    if (frame.parentNode) frame.parentNode.removeChild(frame);
    if (video && !document.body.classList.contains('ritual-started')) video.play().catch(function () {});
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGEM || e.source !== frame.contentWindow || !e.data) return;
    if (e.data.cabana === 'pronta') revelar();
    else if (e.data.cabana === 'erro') remover();
  });

  // botão "Ambiente" do lobby: com a cena ativa, liga/desliga o som dela
  if (botaoAudio) {
    botaoAudio.addEventListener('click', function () {
      if (!pronta) return;
      if (audio) audio.pause();   // o lobby-video.js religa o ambiente dele; com a cena ativa, não
      avisarCena('mudo', mudo());
    });
  }

  // o ritual começou: a cena sai (GPU livre para a mesa e as câmeras)
  new MutationObserver(function () {
    if (document.body.classList.contains('ritual-started')) remover();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();

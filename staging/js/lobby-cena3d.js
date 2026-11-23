/* Lobby: cabana em 3D (Godot / WebGL 2) no lugar do vídeo de fundo.
 *
 * A cena é publicada no Cloudflare R2 (projeto sextolugar-godot, ferramentas/publicar_web.py) e
 * entra num iframe de outro site (cena.preludiojogos.com.br, Worker cloudflare/cena; .com.br ≠ .com): o Chrome roda a cena num processo próprio, então a
 * compilação de shaders da primeira visita não trava a interface do lobby.
 *
 * A espera já é a cena nova: js/lobby-cena3d-cedo.js (no <head>) marca <html class="cena3d"> e o CSS
 * mostra o quadro dela (mesmo enquadramento) no lugar do vídeo antigo, que fica pausado; quando a
 * cena avisa que está pronta (postMessage {cabana:'pronta'}) o iframe entra em fade por cima. Só em computador com WebGL 2 —
 * celular, economia de dados ou pouca memória seguem com o vídeo. ?cena3d=0 desliga (teste).
 * Quando o ritual começa, o iframe sai e libera a GPU para o jogo e as câmeras.
 */
(function () {
  'use strict';
  var ORIGEM = 'https://cena.preludiojogos.com.br';
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

  var raiz = document.documentElement;
  if (document.body.classList.contains('ritual-started')) return;
  if (!raiz.classList.contains('cena3d')) {
    if (!podeUsar3D()) return;          // (página antiga em cache sem o script cedo)
    raiz.classList.add('cena3d');
  }
  // o vídeo do fundo antigo não toca por baixo (nem quando o lobby-video.js tenta religá-lo)
  if (video) {
    video.pause();
    video.addEventListener('play', function () {
      if (raiz.classList.contains('cena3d')) video.pause();
    });
  }

  var frame = document.createElement('iframe');
  var pronta = false;
  var removida = false;
  frame.className = 'lobbyViewer__cena';
  frame.title = 'Cabana do SEXTOLUGAR em 3D — os jogadores da sala à mesa';
  frame.tabIndex = -1;
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
    if (removida) return;
    removida = true;
    if (observador) observador.disconnect();
    document.body.classList.remove('lobby-cena3d-pronta');
    raiz.classList.remove('cena3d');   // sem a cena: o vídeo antigo volta
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

  // "Entrar pelo app": aqui a cabana é para assistir; andar e mexer nas coisas é no app do Windows.
  // O link sextolugar:// abre o app (ele se registra na primeira vez que roda). Se nada abrir em
  // ~1,6 s (a página não perdeu o foco para o diálogo do navegador), mostra o download.
  var APP_LINK = 'sextolugar://cabana';
  var APP_ZIP = ORIGEM + '/app/SEXTOLUGAR-windows.zip';
  if (/Windows/i.test(navigator.userAgent)) {
    var caixaApp = document.createElement('div');
    caixaApp.className = 'lobbyViewer__app';
    var botaoApp = document.createElement('button');
    botaoApp.type = 'button';
    botaoApp.className = 'lobbyViewer__appBotao';
    botaoApp.textContent = 'Entrar pelo app';
    var avisoApp = document.createElement('div');
    avisoApp.className = 'lobbyViewer__appAviso';
    avisoApp.hidden = true;
    avisoApp.appendChild(document.createTextNode('Ainda não tem o app? '));
    var linkApp = document.createElement('a');
    linkApp.href = APP_ZIP;
    linkApp.textContent = 'Baixar para Windows (940 MB)';
    avisoApp.appendChild(linkApp);
    avisoApp.appendChild(document.createTextNode(' — descompacte e abra o SEXTOLUGAR.exe uma vez; depois este botão abre o app direto.'));
    caixaApp.appendChild(botaoApp);
    caixaApp.appendChild(avisoApp);
    viewer.appendChild(caixaApp);
    botaoApp.addEventListener('click', function () {
      var abriu = false;
      var marcar = function () { abriu = true; };
      window.addEventListener('blur', marcar);
      document.addEventListener('visibilitychange', marcar);
      location.href = APP_LINK;
      setTimeout(function () {
        window.removeEventListener('blur', marcar);
        document.removeEventListener('visibilitychange', marcar);
        if (!abriu) avisoApp.hidden = false;
      }, 1600);
    });
  }

  // o ritual começou: a cena sai (GPU livre para a mesa e as câmeras)
  var observador = new MutationObserver(function () {
    if (document.body.classList.contains('ritual-started')) remover();
  });
  observador.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();

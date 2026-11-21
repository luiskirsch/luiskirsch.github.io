/* Lobby: decide ANTES do primeiro desenho se a cabana 3D vai entrar (js/lobby-cena3d.js).
 *
 * Marca <html class="cena3d"> com as mesmas condições da cena (computador com WebGL 2, sem economia
 * de dados nem pouca memória; ?cena3d=0/1 força). Com a classe, o CSS da sala já mostra o quadro da
 * cena nova (assets/lobby-cena3d-poster.webp, mesmo enquadramento) no lugar do vídeo do fundo
 * antigo — a espera já é a cena nova, e o iframe ao vivo entra por cima, idêntico, quando fica pronto.
 * Se a cena falhar, js/lobby-cena3d.js tira a classe e o vídeo antigo volta.
 * Carregado no <head>, síncrono (arquivo pequeno; a CSP da sala não permite script inline sem hash).
 */
(function () {
  'use strict';
  try {
    if (window.top !== window.self) return;
    var q = new URLSearchParams(location.search);
    var forcar = q.get('cena3d');
    var usar;
    if (forcar === '0') usar = false;
    else if (forcar === '1') usar = true;
    else {
      usar = !(navigator.connection && navigator.connection.saveData) &&
        matchMedia('(pointer: fine)').matches &&
        !(navigator.deviceMemory && navigator.deviceMemory < 4) &&
        !!document.createElement('canvas').getContext('webgl2');
    }
    if (!usar) return;
    document.documentElement.classList.add('cena3d');
    var l = document.createElement('link');
    l.rel = 'preload';
    l.as = 'image';
    l.type = 'image/webp';
    l.href = '/assets/lobby-cena3d-poster.webp?v=1';
    l.setAttribute('fetchpriority', 'high');
    document.head.appendChild(l);
  } catch (e) { /* sem a classe: segue o vídeo de sempre */ }
})();

// Aviso de gravação de segurança para todas as pessoas na sala.
//
// Toda sala do SextoLugar é gravada por segurança enquanto há sessão ou vídeo
// (o servidor inicia a gravação sozinho) e o vídeo é apagado após 30 dias.
// O aviso fixo fica na barra da sala (sala.html, #secRecNotice); este script
// mostra também um toast ao entrar, uma vez por sala em cada aba.
(function () {
  'use strict';

  var room = new URLSearchParams(window.location.search).get("sala") || "";
  var storageKey = "osl_sec_rec_notice_" + room;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
  } catch (_) { /* sem sessionStorage: mostra mesmo assim */ }

  function show() {
    var tr = typeof window.oslTr === "function" ? window.oslTr : function (_key, fallback) { return fallback; };
    var message = tr(
      "sala:securityRecording.toast",
      "Esta sala é gravada por segurança. A gravação fica guardada por 30 dias e depois é apagada automaticamente."
    );
    if (typeof window.showOslToast === "function") window.showOslToast(message, "info");
  }

  if (document.readyState === "complete") setTimeout(show, 1500);
  else window.addEventListener("load", function () { setTimeout(show, 1500); });
})();

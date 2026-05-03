/* ============================================================
   theme-bootstrap.js  ·  SÍNCRONO  ·  ZERO FLASH
   ============================================================
   Roda BLOCKING no <head> ANTES de qualquer outro script ou render.
   Lê o tema corrente do localStorage (sem fetch) e aplica:
     - cssVars no <html>
     - bodyClass no <body> (assim que body existir)
     - <link rel="stylesheet"> do tema
   Resultado: o primeiro paint já tem o tema aplicado, sem flash do
   layout default em reload, primeira visita ou troca de idioma.

   Não substitui theme-loader.js — só dá o frame inicial. theme-loader
   continua sendo fonte de verdade: faz fetch fresh, aplica copy, hooks
   etc. Quando theme-loader terminar, refresca o cache cheio (key
   'osl_theme_full_cached_<id>') pra próxima visita estar atualizada.
   ============================================================ */
(function () {
  'use strict';
  var OVERRIDE_KEY = 'osl_theme_override';
  var CACHE_KEY    = 'osl_active_theme_cached';
  var FULL_PREFIX  = 'osl_theme_full_cached_';

  // 1) Resolve qual tema aplicar (mesma ordem de resolveInitialThemeName em
  //    theme-loader: URL > localStorage override > localStorage cache > default)
  var themeId = null;
  try {
    var u = new URL(window.location.href);
    themeId = u.searchParams.get('theme');
  } catch (e) { /* empty */ }
  if (!themeId) {
    try { themeId = localStorage.getItem(OVERRIDE_KEY); } catch (e) { /* empty */ }
  }
  if (!themeId) {
    try { themeId = localStorage.getItem(CACHE_KEY); } catch (e) { /* empty */ }
  }
  if (!themeId || themeId === 'default') return;

  // 2) Lê JSON do tema do cache (gravado por theme-loader em loads anteriores)
  var theme = null;
  try {
    var raw = localStorage.getItem(FULL_PREFIX + themeId);
    if (raw) theme = JSON.parse(raw);
  } catch (e) { /* empty */ }
  if (!theme || theme.id !== themeId) return; // sem cache → theme-loader resolve

  // 3) Aplica cssVars imediatamente no <html>
  var root = document.documentElement;
  if (theme.cssVars && typeof theme.cssVars === 'object') {
    for (var k in theme.cssVars) {
      if (Object.prototype.hasOwnProperty.call(theme.cssVars, k)) {
        root.style.setProperty(k, theme.cssVars[k]);
      }
    }
  }

  // 4) bodyClass — agora se body já existir, ou via DOMContentLoaded
  function applyBody() {
    if (!document.body) return;
    document.body.classList.add('osl-theme', 'osl-theme-' + themeId);
    if (theme.bodyClass) {
      String(theme.bodyClass).split(/\s+/).forEach(function (c) {
        if (c) document.body.classList.add(c);
      });
    }
  }
  if (document.body) applyBody();
  else document.addEventListener('DOMContentLoaded', applyBody, { once: true });

  // 5) Stylesheet do tema — injeta <link> no head ASAP. theme-loader vai
  //    detectar o id 'osl-theme-stylesheet' e reutilizar (não duplica).
  if (theme.stylesheet) {
    var href = theme.stylesheet;
    if (!/^https?:|^\//.test(href)) {
      var pathname = window.location.pathname;
      var base = pathname.indexOf('/staging/') === 0 ? '/staging/' : '/';
      href = base + href.replace(/^\.\//, '');
    }
    var existing = document.getElementById('osl-theme-stylesheet');
    if (existing) {
      if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    } else {
      var link = document.createElement('link');
      link.id = 'osl-theme-stylesheet';
      link.rel = 'stylesheet';
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
    }
  }

  // 6) Marca window.OSL_THEME_BOOTSTRAPPED pra theme-loader saber que já
  //    rodou (e poder optar por não duplicar trabalho síncrono).
  window.OSL_THEME_BOOTSTRAPPED = themeId;
})();

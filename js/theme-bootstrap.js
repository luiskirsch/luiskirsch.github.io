/* ============================================================
   theme-bootstrap.js  ·  SÍNCRONO  ·  ZERO FLASH
   ============================================================
   Roda BLOCKING no <head> ANTES de qualquer outro script ou render.
   Lê o tema corrente do localStorage (sem fetch) e aplica:
     - cssVars no <html>
     - classes no <html> (osl-theme, osl-theme-<id>, bodyClass)
     - classes no <body> via MutationObserver (assim que <body> aparece,
       AINDA durante o parse — antes do primeiro paint)
     - <style> INLINE com o CSS do tema (cacheado como string)
       em vez de <link> (que seria async/render-blocking-network)
   Resultado: o primeiro paint já tem o tema aplicado em qualquer
   carga subsequente (após o cache populado pela primeira visita).
   ============================================================ */
(function () {
  'use strict';
  var OVERRIDE_KEY = 'osl_theme_override';
  var CACHE_KEY    = 'osl_active_theme_cached';
  var FULL_PREFIX  = 'osl_theme_full_cached_';
  var CSS_PREFIX   = 'osl_theme_css_cached_';

  // 1) Resolve qual tema aplicar (URL > localStorage override > localStorage cache)
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

  // 2) Lê JSON do tema do cache (gravado por theme-loader)
  var theme = null;
  try {
    var raw = localStorage.getItem(FULL_PREFIX + themeId);
    if (raw) theme = JSON.parse(raw);
  } catch (e) { /* empty */ }
  if (!theme || theme.id !== themeId) return;

  // 3) Aplica cssVars em <html>
  var root = document.documentElement;
  if (theme.cssVars && typeof theme.cssVars === 'object') {
    for (var k in theme.cssVars) {
      if (Object.prototype.hasOwnProperty.call(theme.cssVars, k)) {
        root.style.setProperty(k, theme.cssVars[k]);
      }
    }
  }

  // 3.1) <style> EARLY: aplica bg/color base IMEDIATO em <html> (que existe
  //      desde o início do parse). Garante que o primeiro paint use as
  //      cores do tema mesmo antes do <body> aparecer e do CSS principal
  //      do tema (body.theme-X) entrar em vigor. Este style é prepended
  //      no head pra preceder qualquer outro CSS render-blocking; usa
  //      especificidade :root.theme-X que vence regras de tag puras.
  var earlyId = 'osl-theme-early';
  if (!document.getElementById(earlyId)) {
    var earlyCSS = ':root.osl-theme-' + themeId + '{background:var(--bg)!important;color:var(--text)!important}'
      + 'html.osl-theme-' + themeId + ' body{background:var(--bg)!important;color:var(--text)!important}';
    var earlyStyle = document.createElement('style');
    earlyStyle.id = earlyId;
    earlyStyle.appendChild(document.createTextNode(earlyCSS));
    var head = document.head || document.documentElement;
    if (head.firstChild) head.insertBefore(earlyStyle, head.firstChild);
    else head.appendChild(earlyStyle);
  }

  // 4) Classes em <html> (já existe agora) e em <body> (assim que aparecer)
  var classesToAdd = ['osl-theme', 'osl-theme-' + themeId];
  if (theme.bodyClass) {
    String(theme.bodyClass).split(/\s+/).forEach(function (c) {
      if (c) classesToAdd.push(c);
    });
  }
  classesToAdd.forEach(function (c) { root.classList.add(c); });

  function applyBody(body) {
    classesToAdd.forEach(function (c) { body.classList.add(c); });
  }
  if (document.body) {
    applyBody(document.body);
  } else {
    // MutationObserver pega <body> assim que aparece, AINDA durante o parse,
    // antes do primeiro paint — não espera DOMContentLoaded.
    var mo = new MutationObserver(function () {
      if (document.body) {
        applyBody(document.body);
        mo.disconnect();
      }
    });
    mo.observe(document.documentElement, { childList: true });
  }

  // 5) CSS do tema INLINE como <style> (sync, sem network).
  //    theme-loader cacheia o conteúdo do .css em osl_theme_css_cached_<id>.
  //    Fallback: <link rel=stylesheet> se cssText não estiver em cache (1ª visita).
  var STYLE_ID = 'osl-theme-stylesheet';
  if (!document.getElementById(STYLE_ID)) {
    var cssText = null;
    try { cssText = localStorage.getItem(CSS_PREFIX + themeId); } catch (e) { /* empty */ }
    if (cssText && typeof cssText === 'string' && cssText.length > 0) {
      var styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.setAttribute('data-osl-inline', '1');
      styleEl.appendChild(document.createTextNode(cssText));
      (document.head || document.documentElement).appendChild(styleEl);
    } else if (theme.stylesheet) {
      // Fallback async — só na primeira visita absoluta
      var href = theme.stylesheet;
      if (!/^https?:|^\//.test(href)) {
        var pathname = window.location.pathname;
        var base = pathname.indexOf('/staging/') === 0 ? '/staging/' : '/';
        href = base + href.replace(/^\.\//, '');
      }
      var link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
    }
  }

  window.OSL_THEME_BOOTSTRAPPED = themeId;
})();

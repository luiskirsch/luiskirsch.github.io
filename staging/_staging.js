(function () {
  'use strict';

  if (window.__OSL_STAGING_LOADED__) return;
  window.__OSL_STAGING_LOADED__ = true;

  function buildBanner() {
    var bar = document.createElement('div');
    bar.id = 'osl-staging-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span class="osl-staging-dot"></span>' +
      '<strong>STAGING</strong>' +
      '<span class="osl-staging-sep">·</span>' +
      '<span class="osl-staging-text">Ambiente de testes do O SextoLugar. Não compartilhar este link.</span>' +
      '<a class="osl-staging-link" href="https://preludiojogos.com.br/" rel="noopener">ir para produção &rarr;</a>';

    var style = document.createElement('style');
    style.textContent =
      '#osl-staging-bar{position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'display:flex;align-items:center;gap:8px;padding:6px 14px;' +
      'background:linear-gradient(90deg,#ff8a00,#ff5a00);color:#fff;' +
      'font:600 12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;' +
      'letter-spacing:.4px;box-shadow:0 2px 12px rgba(0,0,0,.35);' +
      'border-bottom:1px solid rgba(0,0,0,.25)}' +
      '#osl-staging-bar strong{letter-spacing:1.2px}' +
      '#osl-staging-bar .osl-staging-sep{opacity:.6}' +
      '#osl-staging-bar .osl-staging-text{font-weight:500;opacity:.95;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}' +
      '#osl-staging-bar .osl-staging-dot{width:8px;height:8px;border-radius:50%;' +
      'background:#fff;box-shadow:0 0 8px #fff;animation:oslStagingPulse 1.4s infinite}' +
      '#osl-staging-bar .osl-staging-link{margin-left:auto;color:#fff;text-decoration:underline;' +
      'opacity:.95;font-weight:600;white-space:nowrap}' +
      '#osl-staging-bar .osl-staging-link:hover{opacity:1}' +
      '@keyframes oslStagingPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
      'html{scroll-padding-top:32px}' +
      'body{padding-top:30px!important}' +
      '@media (max-width:520px){#osl-staging-bar .osl-staging-text{display:none}}';

    document.documentElement.appendChild(style);
    (document.body || document.documentElement).appendChild(bar);
    document.title = '[STAGING] ' + document.title;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBanner);
  } else {
    buildBanner();
  }
})();

(function () {
  'use strict';

  if (window.__OSL_THEME_LOADED__) return;
  window.__OSL_THEME_LOADED__ = true;

  var DEFAULT_THEME = 'default';
  var OVERRIDE_KEY  = 'osl_theme_override';
  var CACHE_KEY     = 'osl_active_theme_cached';

  // True when the resolved theme came from a manual override (URL or storage),
  // meaning active-theme.js (Firestore) must NOT replace it.
  var manualOverride = false;
  var currentThemeId = null;

  function readUrlOverride() {
    try {
      var u = new URL(window.location.href);
      return u.searchParams.get('theme');
    } catch (e) { return null; }
  }

  function readStorageOverride() {
    try { return localStorage.getItem(OVERRIDE_KEY); } catch (e) { return null; }
  }

  function readCache() {
    try { return localStorage.getItem(CACHE_KEY); } catch (e) { return null; }
  }

  function resolveInitialThemeName() {
    var urlTheme = readUrlOverride();
    if (urlTheme) { manualOverride = true; return urlTheme; }

    var stored = readStorageOverride();
    if (stored) { manualOverride = true; return stored; }

    var cached = readCache();
    if (cached) return cached;

    return DEFAULT_THEME;
  }

  function themesBaseUrl() {
    var script = document.currentScript;
    var src = (script && script.src) || '';
    var base = src.replace(/js\/theme-loader\.js.*$/, '');
    if (!base) {
      base = window.location.pathname.replace(/[^/]*$/, '');
    }
    return base + 'themes/';
  }

  function applyCssVars(theme) {
    if (!theme.cssVars) return;
    var root = document.documentElement;
    for (var k in theme.cssVars) {
      if (Object.prototype.hasOwnProperty.call(theme.cssVars, k)) {
        root.style.setProperty(k, theme.cssVars[k]);
      }
    }
  }

  function applyBodyClasses(theme) {
    var run = function () {
      if (!document.body) return;
      // remove previous theme class if changing
      Array.prototype.slice.call(document.body.classList).forEach(function (c) {
        if (c.indexOf('osl-theme-') === 0) document.body.classList.remove(c);
      });
      document.body.classList.add('osl-theme', 'osl-theme-' + (theme.id || 'unknown'));
      if (theme.bodyClass) {
        String(theme.bodyClass).split(/\s+/).forEach(function (c) {
          if (c) document.body.classList.add(c);
        });
      }
    };
    if (document.body) run();
    else document.addEventListener('DOMContentLoaded', run);
  }

  // Resolve o subset de copy pra aplicar baseado no locale corrente.
  // Suporta DUAS formas de copy no JSON do tema:
  //   1. Plana: copy: { "ns.key": "valor" }                   — aplica em todos os locales
  //   2. Por locale: copy: { "pt-BR": {...}, "en-US": {...} } — aplica só o locale atual
  // Se o copy mistura: chaves que parecem locale (\w{2}-\w{2}) vão pra modo locale,
  // o resto é fallback aplicado sempre.
  function resolveCopyForLocale(rawCopy) {
    if (!rawCopy || typeof rawCopy !== 'object') return {};
    var locale = (window.i18next && window.i18next.language)
      || (window.OSL_I18N && window.OSL_I18N.locale && window.OSL_I18N.locale())
      || document.documentElement.getAttribute('lang')
      || 'pt-BR';
    var localeRe = /^[a-z]{2}-[A-Z]{2}$/;
    var hasLocaleBuckets = Object.keys(rawCopy).some(function (k) { return localeRe.test(k); });
    if (!hasLocaleBuckets) return rawCopy;
    var result = {};
    // Fallback: chaves no top level que NÃO são locales aplicam sempre
    Object.keys(rawCopy).forEach(function (k) {
      if (!localeRe.test(k) && typeof rawCopy[k] === 'string') result[k] = rawCopy[k];
    });
    // Locale específico vence
    var localeBucket = rawCopy[locale];
    if (localeBucket && typeof localeBucket === 'object') {
      Object.keys(localeBucket).forEach(function (k) { result[k] = localeBucket[k]; });
    }
    return result;
  }

  function applyCopy(theme) {
    var rawCopy = theme.copy || {};
    // Suporta DOIS estilos de chave:
    //   - data-theme-key="ns.path"      (sistema antigo, opt-in via marcação)
    //   - data-i18n="ns:path"           (auto-override do i18n; troca os dois pontos por ponto)
    var run = function () {
      var copy = resolveCopyForLocale(rawCopy);
      Object.keys(copy).forEach(function (k) {
        // (a) data-theme-key explícito
        document.querySelectorAll('[data-theme-key="' + k + '"]').forEach(function (el) {
          el.innerHTML = copy[k];
        });
        // (b) data-i18n e variantes (placeholder/title/aria-label/alt) — converte
        //     "ns.path" → "ns:path" pra casar com o formato i18next
        var i18nKey = k.replace('.', ':');
        document.querySelectorAll('[data-i18n="' + i18nKey + '"]').forEach(function (el) {
          el.textContent = copy[k];
        });
        document.querySelectorAll('[data-i18n-html="' + i18nKey + '"]').forEach(function (el) {
          el.innerHTML = copy[k];
        });
        ['placeholder','title','aria-label','alt'].forEach(function (attr) {
          document.querySelectorAll('[data-i18n-' + attr + '="' + i18nKey + '"]').forEach(function (el) {
            el.setAttribute(attr, copy[k]);
          });
        });
      });
      // Hook adicional: override do OSL_I18N.t pra que JS dinâmico que usa
      // oslTr/i18next também respeite a copy do tema (locale-aware).
      installCopyTOverride(copy);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
    // Re-aplica quando i18n termina de carregar (init.js) ou troca idioma.
    // languageChanged é o evento do i18next quando OSL_I18N.change() é chamado.
    document.addEventListener('osl:i18n-ready', run);
    if (window.i18next && typeof window.i18next.on === 'function') {
      window.i18next.on('languageChanged', run);
    } else {
      // Bind tardio quando i18next inicializar
      document.addEventListener('osl:i18n-ready', function once() {
        document.removeEventListener('osl:i18n-ready', once);
        if (window.i18next && typeof window.i18next.on === 'function') {
          window.i18next.on('languageChanged', run);
        }
      }, { once: true });
    }
  }

  // Substitui i18next.t pra que strings dinâmicas (textContent setados via JS)
  // também respeitem o copy do tema. Idempotente: chamado a cada applyCopy.
  function installCopyTOverride(copy) {
    if (!window.i18next || typeof window.i18next.t !== 'function') {
      document.addEventListener('osl:i18n-ready', function once() {
        document.removeEventListener('osl:i18n-ready', once);
        installCopyTOverride(copy);
      }, { once: true });
      return;
    }
    var orig = window.i18next._origT || window.i18next.t.bind(window.i18next);
    window.i18next._origT = orig;
    window.i18next.t = function (key, opts) {
      var normalized = String(key || '').replace(':', '.');
      if (Object.prototype.hasOwnProperty.call(copy, normalized)) {
        var v = copy[normalized];
        if (opts && typeof v === 'string') {
          return v.replace(/\{\{(\w+)\}\}/g, function (_, k) {
            return opts[k] != null ? opts[k] : '';
          });
        }
        return v;
      }
      return orig(key, opts);
    };
    if (window.OSL_I18N) window.OSL_I18N.t = window.i18next.t;
  }

  function applyImages(theme) {
    var imgs = theme.images || {};
    var run = function () {
      Object.keys(imgs).forEach(function (k) {
        var nodes = document.querySelectorAll('[data-theme-img="' + k + '"]');
        nodes.forEach(function (el) {
          var src = imgs[k];
          if (el.tagName === 'IMG') {
            el.src = src;
          } else if (el.tagName === 'LINK') {
            el.href = src;
          } else {
            el.style.backgroundImage = "url('" + src + "')";
          }
        });
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  // Carrega/troca <link rel="stylesheet"> exclusivo do tema. Permite overrides
  // profundos de layout (não só cssVars/copy). Removido ao trocar de tema.
  function applyStylesheet(theme) {
    var EL_ID = 'osl-theme-stylesheet';
    var existing = document.getElementById(EL_ID);
    if (!theme.stylesheet) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    var href = theme.stylesheet;
    if (!/^https?:|^\//.test(href)) {
      // resolve relativo a themes/
      href = themesBaseUrl().replace(/themes\/$/, '') + (href.replace(/^\.\//, ''));
    }
    if (existing) {
      if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
      return;
    }
    var link = document.createElement('link');
    link.id = EL_ID; link.rel = 'stylesheet'; link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    applyCssVars(theme);
    applyBodyClasses(theme);
    applyStylesheet(theme);
    applyCopy(theme);
    applyImages(theme);
    window.OSL_THEME = theme;
    currentThemeId = theme.id || null;
    try {
      document.dispatchEvent(new CustomEvent('osl-theme-applied', { detail: theme }));
    } catch (e) {}
  }

  // Cache do JSON completo no localStorage pra theme-bootstrap.js aplicar
  // síncrono no próximo carregamento (zero flash em reload / primeiro acesso).
  var FULL_CACHE_PREFIX = 'osl_theme_full_cached_';
  function cacheFullTheme(theme) {
    if (!theme || !theme.id) return;
    try { localStorage.setItem(FULL_CACHE_PREFIX + theme.id, JSON.stringify(theme)); } catch (e) { /* quota etc */ }
  }

  function loadTheme(name) {
    return fetch(themesBaseUrl() + name + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('theme not found: ' + name);
        return r.json();
      })
      .then(function (theme) {
        cacheFullTheme(theme);
        return theme;
      });
  }

  // Initial resolve
  var initialName = resolveInitialThemeName();

  loadTheme(initialName)
    .then(applyTheme)
    .catch(function (err) {
      if (initialName !== DEFAULT_THEME) {
        console.warn('[osl-theme] failed to load "' + initialName + '", falling back to default:', err);
        loadTheme(DEFAULT_THEME).then(applyTheme).catch(function (e2) {
          console.warn('[osl-theme] default fallback also failed:', e2);
        });
      } else {
        console.warn('[osl-theme] failed to load default theme:', err);
      }
    });

  // Public helpers (used by StagingBanner long-press, dev console, admin tool)
  window.OSL_setTheme = function (themeName, persist) {
    if (persist) {
      try { localStorage.setItem(OVERRIDE_KEY, themeName); } catch (e) {}
      manualOverride = true;
    }
    return loadTheme(themeName).then(applyTheme);
  };

  window.OSL_clearThemeOverride = function () {
    try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) {}
    manualOverride = false;
    // Re-apply whichever non-override source resolves now
    var next = readCache() || DEFAULT_THEME;
    return loadTheme(next).then(applyTheme).catch(function () {});
  };

  // Active-theme integration: active-theme.js calls this when Firestore resolves.
  // We only apply if no manual override is in effect AND the new theme is
  // different from what's currently rendered (avoid pointless refetch).
  window.OSL_applyActiveTheme = function (themeId) {
    if (!themeId) return Promise.resolve();
    if (manualOverride) return Promise.resolve();
    if (currentThemeId === themeId) return Promise.resolve();
    return loadTheme(themeId).then(applyTheme).catch(function (err) {
      console.warn('[osl-theme] active-theme apply failed for "' + themeId + '":', err);
    });
  };
})();

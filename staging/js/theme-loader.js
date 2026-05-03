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

  function applyCopy(theme) {
    var copy = theme.copy || {};
    var run = function () {
      Object.keys(copy).forEach(function (k) {
        var nodes = document.querySelectorAll('[data-theme-key="' + k + '"]');
        nodes.forEach(function (el) {
          el.innerHTML = copy[k];
        });
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
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

  function loadTheme(name) {
    return fetch(themesBaseUrl() + name + '.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('theme not found: ' + name);
        return r.json();
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

(function () {
  'use strict';

  if (window.__OSL_THEME_LOADED__) return;
  window.__OSL_THEME_LOADED__ = true;

  var DEFAULT_THEME = 'default';
  var STORAGE_KEY = 'osl_theme_override';

  function resolveThemeName() {
    try {
      var u = new URL(window.location.href);
      var t = u.searchParams.get('theme');
      if (t) return t;
    } catch (e) {}

    try {
      var s = localStorage.getItem(STORAGE_KEY);
      if (s) return s;
    } catch (e) {}

    if (window.OSL_ACTIVE_THEME) return window.OSL_ACTIVE_THEME;

    return DEFAULT_THEME;
  }

  function themesBaseUrl() {
    var script = document.currentScript;
    var src = (script && script.src) || '';
    var base = src.replace(/js\/theme-loader\.js.*$/, '');
    if (!base) {
      var path = window.location.pathname.replace(/[^/]*$/, '');
      base = path;
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

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    applyCssVars(theme);
    applyBodyClasses(theme);
    applyCopy(theme);
    applyImages(theme);
    window.OSL_THEME = theme;
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

  var name = resolveThemeName();

  loadTheme(name)
    .then(applyTheme)
    .catch(function (err) {
      if (name !== DEFAULT_THEME) {
        console.warn('[osl-theme] failed to load "' + name + '", falling back to default:', err);
        loadTheme(DEFAULT_THEME).then(applyTheme).catch(function (e2) {
          console.warn('[osl-theme] default fallback also failed:', e2);
        });
      } else {
        console.warn('[osl-theme] failed to load default theme:', err);
      }
    });

  window.OSL_setTheme = function (themeName, persist) {
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, themeName); } catch (e) {}
    }
    return loadTheme(themeName).then(applyTheme);
  };

  window.OSL_clearThemeOverride = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };
})();

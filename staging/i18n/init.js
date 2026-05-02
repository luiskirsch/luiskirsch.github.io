(function () {
  'use strict';

  if (window.OSL_I18N_LOADED) return;
  window.OSL_I18N_LOADED = true;

  const SUPPORTED = ['pt-BR', 'en-US'];
  const DEFAULT_LOCALE = 'pt-BR';
  const STORAGE_KEY = 'osl_lang';
  const I18NEXT_CDN = 'https://unpkg.com/i18next@23.16.4/dist/umd/i18next.min.js';
  const BACKEND_CDN = 'https://unpkg.com/i18next-http-backend@2.6.2/i18nextHttpBackend.min.js';

  function detectLocale() {
    try {
      const url = new URLSearchParams(location.search).get('lang');
      if (url && SUPPORTED.includes(url)) return url;
    } catch (_) { /* empty */ }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (_) { /* empty */ }
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('en')) return 'en-US';
    return DEFAULT_LOCALE;
  }

  function getBasePath() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || '';
      if (src.includes('/i18n/init.js')) {
        return src.replace(/\/init\.js.*$/, '').replace(location.origin, '');
      }
    }
    return '/i18n';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function getNamespaces() {
    const raw = document.documentElement.getAttribute('data-i18n-ns') || '';
    const ns = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!ns.includes('common')) ns.unshift('common');
    return ns;
  }

  function applyTranslations(root) {
    root = root || document;
    if (!window.i18next || !window.i18next.t) return;
    const t = window.i18next.t.bind(window.i18next);

    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const value = t(key);
      if (typeof value === 'string' && value !== key) el.textContent = value;
    });

    // data-i18n-html: usa innerHTML pra preservar tags inline (br, em, strong, etc).
    // Translations vêm de JSONs do próprio repo, sem input de usuário — XSS-safe.
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      const value = t(key);
      if (typeof value === 'string' && value !== key) el.innerHTML = value;
    });

    const attrs = ['title', 'placeholder', 'alt', 'value', 'aria-label'];
    attrs.forEach(attr => {
      root.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        const key = el.getAttribute(`data-i18n-${attr}`);
        if (!key) return;
        const value = t(key);
        if (typeof value === 'string' && value !== key) el.setAttribute(attr, value);
      });
    });

    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) {
      const key = titleEl.getAttribute('data-i18n');
      const value = t(key);
      if (typeof value === 'string' && value !== key) document.title = value;
    }
  }

  function createSwitcher() {
    if (document.getElementById('osl-lang-switcher')) return;
    const cur = window.i18next.language;
    const isEN = cur === 'en-US';

    const wrap = document.createElement('div');
    wrap.id = 'osl-lang-switcher';
    wrap.innerHTML =
      '<button type="button" id="osl-lang-btn" aria-label="Language">' +
      (isEN ? '🇺🇸 EN' : '🇧🇷 PT') +
      '</button>' +
      '<div id="osl-lang-menu" hidden>' +
      '<button type="button" data-lang="pt-BR">🇧🇷 Português</button>' +
      '<button type="button" data-lang="en-US">🇺🇸 English</button>' +
      '</div>';

    const style = document.createElement('style');
    style.textContent =
      '#osl-lang-switcher{position:fixed;bottom:14px;right:14px;z-index:2147483646;' +
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
      '#osl-lang-btn{all:unset;cursor:pointer;background:rgba(0,0,0,.72);color:#fff;' +
      'padding:6px 11px;border-radius:999px;font-size:12px;font-weight:600;' +
      'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 14px rgba(0,0,0,.32)}' +
      '#osl-lang-btn:hover{background:rgba(0,0,0,.85)}' +
      '#osl-lang-menu{position:absolute;bottom:calc(100% + 6px);right:0;' +
      'background:rgba(15,18,28,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
      'border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px;' +
      'display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,.45);min-width:140px}' +
      '#osl-lang-menu[hidden]{display:none}' +
      '#osl-lang-menu button{all:unset;cursor:pointer;padding:8px 10px;color:#fff;' +
      'font-size:13px;border-radius:6px}' +
      '#osl-lang-menu button:hover{background:rgba(255,255,255,.08)}';

    document.head.appendChild(style);
    (document.body || document.documentElement).appendChild(wrap);

    const btn = wrap.querySelector('#osl-lang-btn');
    const menu = wrap.querySelector('#osl-lang-menu');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => { menu.hidden = true; });

    menu.querySelectorAll('button[data-lang]').forEach(b => {
      b.addEventListener('click', () => {
        const lang = b.getAttribute('data-lang');
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* empty */ }
        try {
          const url = new URL(location.href);
          url.searchParams.delete('lang');
          history.replaceState(null, '', url.toString());
        } catch (_) { /* empty */ }
        location.reload();
      });
    });
  }

  async function bootstrap() {
    const locale = detectLocale();
    const namespaces = getNamespaces();
    const basePath = getBasePath();

    document.documentElement.lang = locale;

    if (!window.i18next) await loadScript(I18NEXT_CDN);
    if (!window.i18nextHttpBackend) await loadScript(BACKEND_CDN);

    await window.i18next.use(window.i18nextHttpBackend).init({
      lng: locale,
      fallbackLng: 'pt-BR',
      ns: namespaces,
      defaultNS: namespaces.find(n => n !== 'common') || 'common',
      backend: { loadPath: `${basePath}/locales/{{lng}}/{{ns}}.json` },
      interpolation: { escapeValue: false },
      load: 'currentOnly',
      partialBundledLanguages: false,
      returnEmptyString: false
    });

    applyTranslations();
    createSwitcher();

    window.OSL_I18N = {
      t: (key, opts) => window.i18next.t(key, opts),
      apply: applyTranslations,
      locale: () => window.i18next.language,
      change: async (lng) => {
        await window.i18next.changeLanguage(lng);
        applyTranslations();
      }
    };

    document.dispatchEvent(new Event('osl:i18n-ready'));
  }

  bootstrap().catch(err => {
    console.error('[osl-i18n] init failed:', err);
  });
})();

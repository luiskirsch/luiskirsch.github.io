(function () {
  'use strict';

  if (window.OSL_I18N_LOADED) return;
  window.OSL_I18N_LOADED = true;

  const SUPPORTED = ['pt-BR', 'en-US'];
  const DEFAULT_LOCALE = 'pt-BR';
  const STORAGE_KEY = 'osl_lang';
  const I18NEXT_CDN = '/i18n/lib/i18next.min.js';
  const BACKEND_CDN = '/i18n/lib/i18nextHttpBackend.min.js';

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

    function slugify(s) {
      return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    // Mapa estático de pacote-id → slug usado em cards.json
    const PACK_ID_TO_SLUG = {
      'pacote-conexao': 'conexao',
      'pacote-verdades': 'verdades',
      'pacote-conflito': 'conflito',
      'pacote-segredos': 'segredos',
      'pacote-casais': 'casais'
    };

    // localizeCard(card, packId?) — retorna cópia do card com title/text/rule/phrase/subrule/type
    // localizados quando há tradução. Preserva _origTitle pra effects lookup.
    // Se packId não passado, tenta basic primeiro, depois itera por todos os pack slugs.
    function localizeCard(card, packId) {
      if (!card) return card;
      if (!window.i18next || !window.i18next.t) return card;

      const t = window.i18next.t.bind(window.i18next);
      const slug = slugify(card.title);

      const candidateNs = [];
      if (packId) {
        candidateNs.push(`cards:packs.${PACK_ID_TO_SLUG[packId] || packId}.${slug}`);
      } else {
        candidateNs.push(`cards:basic.${slug}`);
        Object.values(PACK_ID_TO_SLUG).forEach(packSlug => {
          candidateNs.push(`cards:packs.${packSlug}.${slug}`);
        });
      }

      // i18next retorna a chave SEM namespace quando não encontra.
      // Ex: t("cards:basic.foo.title") → "basic.foo.title" (não "cards:basic.foo.title")
      // A comparação simples val !== key não detecta isso; precisa checar o stub também.
      const nsStub = (k) => k.includes(':') ? k.split(':')[1] : k;
      const isRealValue = (val, key) =>
        typeof val === 'string' && val !== '' && val !== key && val !== nsStub(key);

      // Acha o primeiro NS que tem ao menos title traduzido
      let chosenNs = null;
      for (const ns of candidateNs) {
        const titleKey = `${ns}.title`;
        const val = t(titleKey);
        if (isRealValue(val, titleKey)) {
          chosenNs = ns;
          break;
        }
      }
      if (!chosenNs) return card; // sem tradução; retorna original

      const out = { ...card, _origTitle: card.title };
      ['title', 'text', 'rule', 'phrase', 'subrule'].forEach(field => {
        if (card[field] != null && card[field] !== '') {
          const key = `${chosenNs}.${field}`;
          const val = t(key);
          if (isRealValue(val, key)) out[field] = val;
        }
      });
      if (card.type) {
        const tk = `cards:types.${card.type}`;
        const tv = t(tk);
        if (isRealValue(tv, tk)) out.type = tv;
      }
      return out;
    }

    // Encontra packId de uma carta procurando em OSL_PACK_CARDS
    // (chamado quando contexto não tem o packId)
    function findPackId(card, packsMap) {
      if (!packsMap) return null;
      for (const pid of Object.keys(packsMap)) {
        if (packsMap[pid].some(c => c.title === card.title || c.title === card._origTitle)) return pid;
      }
      return null;
    }

    // Localiza uma missão da lista (1..20) com vars de interpolação
    function localizeMission(missionStr, vars) {
      if (!missionStr || !window.i18next) return missionStr;
      const t = window.i18next.t.bind(window.i18next);
      // Tenta achar a missão no PT pra mapear pro número
      // Por simplicidade: missions.list é referenciado via key direto se disponível
      // Caller normalmente passa o índice (1..20) via missionStr começando com "@N:"
      if (typeof missionStr === 'string' && /^@(\d+)$/.test(missionStr)) {
        const n = missionStr.slice(1);
        return t(`missions:list.${n}`, vars || {});
      }
      return missionStr;
    }

    // localizeBackendError(data) — recebe response.json() de erro do backend
    // e retorna mensagem amigável traduzida. Prioridade:
    //   1. backend.errors.{ERROR_CODE}
    //   2. data.message (vem do backend localizado via Accept-Language)
    //   3. data.hint
    //   4. fallback: prefixo + código
    function localizeBackendError(data) {
      if (!data) return '';
      const t = window.i18next?.t?.bind(window.i18next);
      const code = data.error || data.code;
      if (code && t) {
        const key = `backend:errors.${code}`;
        const v = t(key);
        if (v && v !== key) return v;
      }
      if (data.message) return data.message;
      if (data.hint) return data.hint;
      if (code) {
        const prefix = (t && t('backend:errors._genericPrefix')) || 'Erro: ';
        return `${prefix}${code}`;
      }
      return '';
    }

    window.OSL_I18N = {
      t: (key, opts) => window.i18next.t(key, opts),
      apply: applyTranslations,
      locale: () => window.i18next.language,
      change: async (lng) => {
        await window.i18next.changeLanguage(lng);
        applyTranslations();
      },
      slugify,
      localizeCard,
      findPackId,
      localizeMission,
      localizeBackendError
    };

    document.dispatchEvent(new Event('osl:i18n-ready'));
  }

  bootstrap().catch(err => {
    console.error('[osl-i18n] init failed:', err);
  });
})();

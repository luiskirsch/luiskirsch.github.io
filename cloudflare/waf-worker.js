/**
 * Cloudflare WAF Worker — preludiojogos.com
 *
 * Camada de borda em frente ao GitHub Pages. Responsabilidades:
 *  1. Bloqueia UAs de clonadores/downloaders de site (HTTrack, websave, …)
 *  2. Injeta cabeçalhos de segurança em TODAS as respostas, incluindo
 *     frame-ancestors via CSP HTTP header (impossível via <meta>)
 *  3. HSTS para forçar HTTPS mesmo em visitas diretas
 *  4. X-Robots-Tag: noindex nas páginas de app (sala, entrada, painel…)
 */

const CLONER_UA = /\b(httrack|winhttrack|websave|sitesuck(?:er)?|teleport[\s\-.]pro|black[\s\-]widow|webcopier|webzip|webstrip(?:per)?|offline[\s\-.]explorer|surfoffline|netattach|webwhacker|wwwoffle)\b/i;

const SEC_HEADERS = {
  'X-Frame-Options':           'SAMEORIGIN',
  'X-Content-Type-Options':    'nosniff',
  'Referrer-Policy':           'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // frame-ancestors só tem efeito como HTTP header — a meta tag do HTML é ignorada
  'Content-Security-Policy':
    "frame-ancestors 'self' https://preludiojogos.com https://www.preludiojogos.com " +
    "https://preludiojogos.com.br https://www.preludiojogos.com.br",
};

// Páginas de app não devem ser indexadas por buscadores
const NOINDEX_PATHS = new Set([
  '/sala.html', '/entrada.html', '/painel.html',
  '/cadastro.html', '/login.html',
  '/deck-builder.html', '/encontro-marcado.html',
]);

export default {
  async fetch(request) {
    const ua = request.headers.get('User-Agent') || '';

    // 1. Bloqueia clonador na borda — nunca chega ao GitHub Pages
    if (CLONER_UA.test(ua)) {
      return new Response('Acesso negado.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 2. Passa pro GitHub Pages (origem)
    let response;
    try {
      response = await fetch(request);
    } catch (_) {
      return new Response('Bad Gateway', { status: 502 });
    }

    // 3. Injeta headers de segurança
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SEC_HEADERS)) {
      headers.set(k, v);
    }

    // 4. Marca páginas de app com noindex
    const path = new URL(request.url).pathname;
    if (NOINDEX_PATHS.has(path)) {
      headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
